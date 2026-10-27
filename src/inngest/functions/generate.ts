import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { generations, pages, repoFiles, repos } from "@/db/schema";
import { decodeError, guard } from "@/lib/errors-codec";
import { addTokens, finalizeGeneration, loadContext } from "@/lib/generation";
import { updateJob } from "@/lib/jobs";
import { logger } from "@/lib/logger";
import { getUserGithubToken } from "@/lib/user-token";
import { indexGeneration } from "@/lib/qa/index-generation";
import { planOutline } from "@/lib/pipeline/plan";
import { PROMPT_VERSION, planModel, writeModel } from "@/lib/pipeline/types";
import { fetchSnapshot } from "@/lib/snapshot";
import { inngest } from "../client";
import { generateRequested, retryRequested } from "../events";
import { writeWikiPage } from "./write-page";

async function failJob(jobId: string, generationId: string | null, e: unknown) {
  const { code, message } = decodeError(e);
  logger.error({ jobId, generationId, code, message }, "generation failed");
  await updateJob(jobId, { status: "error", step: "Failed", errorCode: code, errorMessage: message });
  if (generationId) {
    await db().update(generations).set({ status: "error", error: message, finishedAt: new Date() }).where(eq(generations.id, generationId));
  }
}

export const generateWiki = inngest.createFunction(
  {
    id: "generate-wiki",
    triggers: [generateRequested],
    // A user may run a couple of repos at once, but never two runs for the same repo.
    concurrency: [
      { key: "event.data.userId", limit: 2 },
      { key: "event.data.owner + '/' + event.data.name", limit: 1 },
    ],
    retries: 2,
  },
  async ({ event, step }) => {
    const { jobId, owner, name, userId } = event.data;
    let generationId: string | null = null;
    try {
      const genId = await step.run("init", () => randomUUID());
      generationId = genId;
      await step.run("mark-running", () => updateJob(jobId, { status: "running", step: "Fetching source from GitHub" }));

      const ingested = await step.run("ingest", () =>
        guard(async () => {
          // The token is read here, inside the step, so it never appears in event payloads or step output.
          const snap = await fetchSnapshot({ user: owner, repo: name }, await getUserGithubToken(userId));
          const [repo] = await db()
            .insert(repos)
            .values({
              owner: snap.owner,
              name: snap.name,
              defaultBranch: snap.branch,
              description: snap.description,
              ownerUserId: userId,
              visibility: snap.private ? "private" : "public",
            })
            .onConflictDoUpdate({
              target: [repos.owner, repos.name],
              set: { defaultBranch: snap.branch, description: snap.description, ownerUserId: userId, visibility: snap.private ? "private" : "public" },
            })
            .returning();
          await db().delete(generations).where(eq(generations.id, genId));
          await db().insert(generations).values({
            id: genId,
            repoId: repo.id,
            commitSha: snap.sha,
            branch: snap.branch,
            planModel: planModel(),
            writeModel: writeModel(),
            promptVersion: PROMPT_VERSION,
          });
          for (let i = 0; i < snap.files.length; i += 50) {
            await db()
              .insert(repoFiles)
              .values(snap.files.slice(i, i + 50).map((f) => ({ ...f, generationId: genId })));
          }
          await updateJob(jobId, { repoId: repo.id, generationId: genId, owner: snap.owner, name: snap.name, step: "Planning outline" });
          return { files: snap.files.length };
        }),
      );
      logger.info({ jobId, generationId: genId, ...ingested }, "ingested");

      const plan = await step.run("plan", () =>
        guard(async () => {
          const ctx = await loadContext(genId);
          const { outline, tokensIn, tokensOut } = await planOutline(ctx);
          await db().delete(pages).where(eq(pages.generationId, genId));
          await db()
            .insert(pages)
            .values(outline.map((p, i) => ({ generationId: genId, slug: p.slug, title: p.title, summary: p.summary, position: i, sourceFiles: p.files })));
          await db().update(generations).set({ outline }).where(eq(generations.id, genId));
          await addTokens(genId, tokensIn, tokensOut);
          await updateJob(jobId, { total: outline.length, done: 0, step: "Writing pages" });
          return { slugs: outline.map((p) => p.slug) };
        }),
      );

      const results = await Promise.allSettled(
        plan.slugs.map((slug) => step.invoke(`write-${slug}`, { function: writeWikiPage, data: { jobId, generationId: genId, slug } })),
      );
      const failed = results.flatMap((r, i) => (r.status === "rejected" ? [{ slug: plan.slugs[i], message: decodeError(r.reason).message }] : []));
      if (failed.length) {
        await step.run("record-failures", async () => {
          for (const f of failed) {
            await db().update(pages).set({ status: "error", error: f.message }).where(and(eq(pages.generationId, genId), eq(pages.slug, f.slug)));
          }
        });
      }

      await step.run("index", async () => {
        await updateJob(jobId, { step: "Indexing for Q&A" });
        try {
          return await indexGeneration(genId);
        } catch (e) {
          // Q&A degrades to unavailable but the wiki itself is still published.
          logger.error({ jobId, generationId: genId, err: e }, "indexing failed");
          return null;
        }
      });
      await step.run("finalize", () => finalizeGeneration(genId, jobId));
      return { generationId: genId, failed: failed.length };
    } catch (e) {
      await step.run("fail", () => failJob(jobId, generationId, e));
      throw e;
    }
  },
);

export const retryFailedPages = inngest.createFunction(
  {
    id: "retry-failed-pages",
    triggers: [retryRequested],
    concurrency: [
      { key: "event.data.userId", limit: 2 },
      { key: "event.data.owner + '/' + event.data.name", limit: 1 },
    ],
    retries: 1,
  },
  async ({ event, step }) => {
    const { jobId, generationId } = event.data;
    try {
      const slugs = await step.run("reset", async () => {
        const failed = await db()
          .select({ slug: pages.slug })
          .from(pages)
          .where(and(eq(pages.generationId, generationId), ne(pages.status, "done")));
        const all = await db().select({ slug: pages.slug }).from(pages).where(eq(pages.generationId, generationId));
        await db()
          .update(pages)
          .set({ status: "pending", error: null })
          .where(and(eq(pages.generationId, generationId), inArray(pages.slug, failed.map((f) => f.slug))));
        await updateJob(jobId, {
          status: "running",
          step: "Retrying failed pages",
          errorCode: null,
          errorMessage: null,
          total: all.length,
          done: all.length - failed.length,
        });
        return failed.map((f) => f.slug);
      });
      const results = await Promise.allSettled(
        slugs.map((slug) => step.invoke(`retry-${slug}`, { function: writeWikiPage, data: { jobId, generationId, slug } })),
      );
      await step.run("record-failures", async () => {
        for (const [i, r] of results.entries()) {
          if (r.status === "rejected") {
            await db().update(pages).set({ status: "error", error: decodeError(r.reason).message }).where(and(eq(pages.generationId, generationId), eq(pages.slug, slugs[i])));
          }
        }
      });
      await step.run("finalize", () => finalizeGeneration(generationId, jobId));
    } catch (e) {
      await step.run("fail", () => updateJob(jobId, { status: "error", step: "Failed", errorCode: decodeError(e).code, errorMessage: decodeError(e).message }));
      throw e;
    }
  },
);
