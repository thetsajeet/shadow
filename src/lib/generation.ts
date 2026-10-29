import { and, asc, desc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { generations, jobs, pages, repoFiles, repos } from "@/db/schema";
import { logger } from "./logger";
import { estimateCostMicros } from "./security-controls";
import type { RepoContext } from "./pipeline/types";

const MANIFESTS = new Set([
  "package.json", "pyproject.toml", "go.mod", "Cargo.toml", "requirements.txt", "pom.xml",
  "build.gradle", "Gemfile", "composer.json", "setup.py", "Dockerfile", "docker-compose.yml",
]);
const KEEP_GENERATIONS = 3;

export async function loadContext(generationId: string): Promise<RepoContext> {
  const [gen] = await db().select().from(generations).where(eq(generations.id, generationId));
  if (!gen) throw new Error(`Generation ${generationId} not found`);
  const [repo] = await db().select().from(repos).where(eq(repos.id, gen.repoId));
  const paths = (
    await db().select({ path: repoFiles.path }).from(repoFiles).where(eq(repoFiles.generationId, generationId)).orderBy(asc(repoFiles.path))
  ).map((r) => r.path);

  const readmePath = paths.find((f) => /^readme(\.[a-z]+)?$/i.test(f));
  const manifestPaths = paths.filter((f) => MANIFESTS.has(f.split("/").pop() ?? "") && f.split("/").length <= 2);
  const want = [...(readmePath ? [readmePath] : []), ...manifestPaths];
  const rows = want.length
    ? await db()
        .select({ path: repoFiles.path, content: repoFiles.content })
        .from(repoFiles)
        .where(and(eq(repoFiles.generationId, generationId), inArray(repoFiles.path, want)))
    : [];
  const byPath = new Map(rows.map((r) => [r.path, r.content]));
  return {
    owner: repo.owner,
    name: repo.name,
    sha: gen.commitSha,
    description: repo.description,
    license: repo.license,
    tree: paths,
    readme: readmePath ? (byPath.get(readmePath) ?? "").slice(0, 12_000) : "",
    manifests: Object.fromEntries(manifestPaths.map((p) => [p, (byPath.get(p) ?? "").slice(0, 6_000)])),
  };
}

export async function loadFiles(generationId: string, paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const rows = await db()
    .select({ path: repoFiles.path, content: repoFiles.content })
    .from(repoFiles)
    .where(and(eq(repoFiles.generationId, generationId), inArray(repoFiles.path, paths)));
  return Object.fromEntries(rows.map((r) => [r.path, r.content]));
}

export async function addTokens(generationId: string, tokensIn: number, tokensOut: number, model = "gemini") {
  const costMicros = estimateCostMicros(model, tokensIn, tokensOut);
  await db()
    .update(generations)
    .set({
      tokensIn: sql`${generations.tokensIn} + ${tokensIn}`,
      tokensOut: sql`${generations.tokensOut} + ${tokensOut}`,
      costMicros: sql`${generations.costMicros} + ${costMicros}`,
    })
    .where(eq(generations.id, generationId));
  logger.info({ generationId, model, tokensIn, tokensOut, costMicros }, "model usage recorded");
}

/** Marks the generation complete, atomically swaps the repo's current pointer and prunes history. */
export async function finalizeGeneration(generationId: string, jobId: string) {
  const result = await db().transaction(async (tx) => {
    const [job] = await tx.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).for("update");
    if (!job || (job.status !== "queued" && job.status !== "running")) return { cancelled: true as const };
    const rows = await tx.select({ status: pages.status }).from(pages).where(eq(pages.generationId, generationId));
    const done = rows.filter((r) => r.status === "done").length;
    const failed = rows.length - done;
    const [gen] = await tx.select().from(generations).where(eq(generations.id, generationId));
    if (!gen) return { cancelled: true as const };

    if (done === 0) {
      await tx.update(generations).set({ status: "error", error: "No pages could be generated", finishedAt: new Date() }).where(eq(generations.id, generationId));
      await tx.update(jobs).set({ status: "error", step: "Failed", errorCode: "LLM_ERROR", errorMessage: "No pages could be generated.", updatedAt: new Date() }).where(eq(jobs.id, jobId));
      return { cancelled: false as const, done, failed, repoId: gen.repoId, noPages: true as const };
    }

    await tx.update(generations).set({ status: failed ? "partial" : "done", finishedAt: new Date() }).where(eq(generations.id, generationId));
    await tx.update(repos).set({ currentGenerationId: generationId }).where(eq(repos.id, gen.repoId));
    await tx.update(jobs).set({
      status: "done",
      step: failed ? `Done (${failed} page${failed > 1 ? "s" : ""} failed)` : "Done",
      errorCode: failed ? "PARTIAL" : null,
      errorMessage: failed ? `${failed} page${failed > 1 ? "s" : ""} failed to generate.` : null,
      updatedAt: new Date(),
    }).where(eq(jobs.id, jobId));
    return { cancelled: false as const, done, failed, repoId: gen.repoId, noPages: false as const };
  });
  if (result.cancelled) return;
  if (result.noPages) return;

  const keep = await db()
    .select({ id: generations.id })
    .from(generations)
    .where(and(eq(generations.repoId, result.repoId), ne(generations.status, "running")))
    .orderBy(desc(generations.startedAt))
    .limit(KEEP_GENERATIONS);
  const keepIds = [...keep.map((k) => k.id), generationId];
  await db().delete(generations).where(and(eq(generations.repoId, result.repoId), ne(generations.status, "running"), notInArray(generations.id, keepIds)));
  logger.info({ jobId, generationId, done: result.done, failed: result.failed }, "generation finalized");
}
