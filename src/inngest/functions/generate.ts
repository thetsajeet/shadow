import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { generations, jobs, pages, rateLimitCounters, repoFiles, repos, session, tokenBudgets, verification } from "@/db/schema";
import { decodeError, guard } from "@/lib/errors-codec";
import { addTokens, finalizeGeneration, loadContext } from "@/lib/generation";
import { getJob, updateJob } from "@/lib/jobs";
import { logger } from "@/lib/logger";
import { getUserGithubToken } from "@/lib/user-token";
import { indexGeneration } from "@/lib/qa/index-generation";
import { planOutline } from "@/lib/pipeline/plan";
import { PROMPT_VERSION, planModel, writeModel } from "@/lib/pipeline/types";
import { fetchSnapshot } from "@/lib/snapshot";
import { canReuseOutline, diffFiles, planReuse, repinLinks, shouldReplan } from "@/lib/sync-diff";
import { assertGenerationAllowed, assertTokenBudget, releaseTokenBudget, settleTokenBudget } from "@/lib/security-controls";
import { env } from "@/env";
import { pruneRetainedRepositoryData } from "@/lib/retention";
import * as Sentry from "@sentry/nextjs";
import { inngest } from "../client";
import { generateRequested, retryRequested } from "../events";
import { writeWikiPage } from "./write-page";

async function failJob(jobId: string, generationId: string | null, e: unknown) {
  const { code, message } = decodeError(e);
  logger.error({ jobId, generationId, code, message }, "generation failed");
  Sentry.captureException(e, { tags: { jobId, generationId: generationId ?? "unallocated" }, extra: { code } });
  await db().transaction(async (tx) => {
    const [job] = await tx.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).for("update");
    if (!job || (job.status !== "queued" && job.status !== "running")) return;
    await tx.update(jobs).set({ status: "error", step: "Failed", errorCode: code, errorMessage: message, updatedAt: new Date() }).where(eq(jobs.id, jobId));
    if (generationId) {
      await tx.update(generations).set({ status: "error", error: message, finishedAt: new Date() }).where(eq(generations.id, generationId));
    }
  });
}

/**
 * Sync fast path: diff the new snapshot against the base generation by blob SHA, keep the old outline
 * and copy pages whose sources did not change. Returns null when a full re-plan is needed.
 */
async function carryForward(genId: string, baseId: string, jobId: string): Promise<{ slugs: string[] } | null> {
  const [base] = await db().select().from(generations).where(eq(generations.id, baseId));
  const [next] = await db().select().from(generations).where(eq(generations.id, genId));
  if (!base || !next || !canReuseOutline(base.promptVersion, next.promptVersion)) return null;

  const sigs = (id: string) => db().select({ path: repoFiles.path, blobSha: repoFiles.blobSha }).from(repoFiles).where(eq(repoFiles.generationId, id));
  const [prevFiles, nextFiles] = await Promise.all([sigs(baseId), sigs(genId)]);
  const diff = diffFiles(prevFiles, nextFiles);
  if (shouldReplan(diff, prevFiles)) return null;

  const basePages = await db().select().from(pages).where(eq(pages.generationId, baseId)).orderBy(asc(pages.position));
  if (basePages.length === 0) return null;
  const [repo] = await db().select().from(repos).where(eq(repos.id, next.repoId));
  const { keep, rewrite } = planReuse(basePages, diff);
  const present = new Set(nextFiles.map((f) => f.path));
  const keepSlugs = new Set(keep.map((p) => p.slug));

  await db().delete(pages).where(eq(pages.generationId, genId));
  await db().insert(pages).values(
    basePages.map((p) => ({
      generationId: genId,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      position: p.position,
      parentSlug: p.parentSlug,
      kind: p.kind,
      sourceFiles: p.sourceFiles.filter((f) => present.has(f)),
      ...(keepSlugs.has(p.slug)
        ? { markdown: repinLinks(p.markdown ?? "", repo.owner, repo.name, base.commitSha, next.commitSha), status: "done" as const, tokens: 0 }
        : {}),
    })),
  );
  await db().update(generations).set({ outline: base.outline }).where(eq(generations.id, genId));
  await updateJob(jobId, { total: rewrite.length, done: 0, step: rewrite.length ? "Updating changed pages" : "No page changes" });
  return { slugs: rewrite.map((p) => p.slug) };
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
    const { jobId, owner, name, userId, baseGenerationId } = event.data;
    let generationId: string | null = null;
    try {
      const active = await step.run("check-job", async () => {
        const job = await getJob(jobId);
        return job?.status === "queued" || job?.status === "running";
      });
      if (!active) return { cancelled: true };
      await assertGenerationAllowed();
      const genId = await step.run("init", () => randomUUID());
      generationId = genId;
      await step.run("mark-running", () => updateJob(jobId, { status: "running", step: "Fetching source from GitHub" }));

      const ingested = await step.run("ingest", () =>
        guard(async () => {
          // The token is read here, inside the step, so it never appears in event payloads or step output.
          const snap = await fetchSnapshot({ user: owner, repo: name }, await getUserGithubToken(userId));
          return db().transaction(async (tx) => {
            const [currentJob] = await tx.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).for("update");
            if (!currentJob || (currentJob.status !== "queued" && currentJob.status !== "running")) return { files: 0, cancelled: true };
            const [repo] = await tx
              .insert(repos)
              .values({
                owner: snap.owner,
                name: snap.name,
                defaultBranch: snap.branch,
                description: snap.description,
                license: snap.license,
                ownerUserId: userId,
                visibility: snap.private ? "private" : "public",
              })
              .onConflictDoUpdate({
                target: [repos.owner, repos.name],
                set: { defaultBranch: snap.branch, description: snap.description, license: snap.license, ownerUserId: userId, visibility: snap.private ? "private" : "public" },
              })
              .returning();
            await tx.delete(generations).where(eq(generations.id, genId));
            await tx.insert(generations).values({
              id: genId,
              repoId: repo.id,
              commitSha: snap.sha,
              branch: snap.branch,
              planModel: planModel(),
              writeModel: writeModel(),
              promptVersion: PROMPT_VERSION,
            });
            for (let i = 0; i < snap.files.length; i += 50) {
              await tx.insert(repoFiles).values(snap.files.slice(i, i + 50).map((f) => ({ ...f, generationId: genId })));
            }
            await tx.update(jobs).set({
              repoId: repo.id,
              generationId: genId,
              owner: snap.owner,
              name: snap.name,
              step: "Planning outline",
              updatedAt: new Date(),
            }).where(eq(jobs.id, jobId));
            return { files: snap.files.length, cancelled: false };
          });
        }),
      );
      logger.info({ jobId, generationId: genId, ...ingested }, "ingested");
      if (ingested.cancelled) return { cancelled: true };

      const plan = await step.run("plan", () =>
        guard(async () => {
          const currentJob = await getJob(jobId);
          if (currentJob?.status !== "queued" && currentJob?.status !== "running") return { slugs: [], cancelled: true };
          await assertGenerationAllowed();
          const reused = baseGenerationId ? await carryForward(genId, baseGenerationId, jobId) : null;
          if (reused) return { ...reused, cancelled: false };
          const ctx = await loadContext(genId);
          const reservation = await assertTokenBudget(genId, "plan");
          let planned: Awaited<ReturnType<typeof planOutline>>;
          try {
            planned = await planOutline(ctx, genId);
          } catch (error) {
            await releaseTokenBudget(reservation);
            throw error;
          }
          const { outline, tokensIn, tokensOut } = planned;
          await settleTokenBudget(reservation, tokensIn + tokensOut);
          await db().delete(pages).where(eq(pages.generationId, genId));
          await db()
            .insert(pages)
            .values(outline.map((p, i) => ({ generationId: genId, slug: p.slug, title: p.title, summary: p.summary, position: i, sourceFiles: p.files })));
          await db().update(generations).set({ outline }).where(eq(generations.id, genId));
          await addTokens(genId, tokensIn, tokensOut, planModel());
          await updateJob(jobId, { total: outline.length, done: 0, step: "Writing pages" });
          return { slugs: outline.map((p) => p.slug), cancelled: false };
        }),
      );
      if (plan.cancelled) return { cancelled: true };

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

      const activeBeforeIndex = await step.run("check-before-index", async () => {
        const job = await getJob(jobId);
        return job?.status === "queued" || job?.status === "running";
      });
      if (!activeBeforeIndex) return { cancelled: true };

      await step.run("index", async () => {
        await updateJob(jobId, { step: "Indexing for Q&A" });
        try {
          await assertGenerationAllowed();
          return await indexGeneration(genId);
        } catch (e) {
          // Q&A degrades to unavailable but the wiki itself is still published.
          logger.error({ jobId, generationId: genId, err: e }, "indexing failed");
          return null;
        }
      });
      const activeBeforeFinalize = await step.run("check-before-finalize", async () => {
        const job = await getJob(jobId);
        return job?.status === "queued" || job?.status === "running";
      });
      if (!activeBeforeFinalize) return { cancelled: true };
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
      const active = await step.run("check-job", async () => {
        const job = await getJob(jobId);
        return job?.status === "queued" || job?.status === "running";
      });
      if (!active) return { cancelled: true };
      await assertGenerationAllowed();
      const reset = await step.run("reset", async () => db().transaction(async (tx) => {
        const [currentJob] = await tx.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).for("update");
        if (!currentJob || (currentJob.status !== "queued" && currentJob.status !== "running")) return { cancelled: true, slugs: [] };
        const failed = await tx
          .select({ slug: pages.slug })
          .from(pages)
          .where(and(eq(pages.generationId, generationId), ne(pages.status, "done")));
        const all = await tx.select({ slug: pages.slug }).from(pages).where(eq(pages.generationId, generationId));
        await tx
          .update(pages)
          .set({ status: "pending", error: null })
          .where(and(eq(pages.generationId, generationId), inArray(pages.slug, failed.map((f) => f.slug))));
        await tx.update(jobs).set({
          status: "running",
          step: "Retrying failed pages",
          errorCode: null,
          errorMessage: null,
          total: all.length,
          done: all.length - failed.length,
          updatedAt: new Date(),
        }).where(eq(jobs.id, jobId));
        return { cancelled: false, slugs: failed.map((f) => f.slug) };
      }));
      if (reset.cancelled) return { cancelled: true };
      const slugs = reset.slugs;
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

export const cleanupRetainedData = inngest.createFunction(
  { id: "cleanup-retained-data", triggers: [{ cron: "0 3 * * *" }] },
  async ({ step }) => {
    const days = env().DATA_RETENTION_DAYS;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return step.run("prune-expired-data", async () => {
      await pruneRetainedRepositoryData(cutoff);
      await db().delete(session).where(sql`${session.expiresAt} < now()`);
      await db().delete(verification).where(sql`${verification.expiresAt} < now()`);
      await db().delete(rateLimitCounters).where(sql`${rateLimitCounters.windowStart} < now() - interval '2 days'`);
      await db().delete(tokenBudgets).where(sql`${tokenBudgets.createdAt} < now() - interval '2 days'`);
      return { cutoff: cutoff.toISOString() };
    });
  },
);
