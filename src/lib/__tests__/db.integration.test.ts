import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const holder = vi.hoisted(() => ({
  db: undefined as unknown,
  env: { GENERATION_ENABLED: "true", MAX_GENERATION_TOKENS: 250_000, DAILY_TOKEN_BUDGET: 1_000_000 },
}));
vi.mock("@/db", () => ({ db: () => holder.db, schema: undefined }));
vi.mock("@/env", () => ({ env: () => holder.env }));

const { finalizeGeneration } = await import("../generation");
const { createJob, getJob, findActiveJob, toView } = await import("../jobs");
const { hybridSearch, toOrQuery } = await import("../qa/retrieve");
const { listPublicWikis, readMeta, readPage } = await import("../wiki-store");
const { deleteRepoWiki } = await import("../delete-repo");
const { assertTokenBudget, releaseTokenBudget, settleTokenBudget } = await import("../security-controls");

let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  const client = new PGlite({ extensions: { vector } });
  await client.exec("CREATE EXTENSION IF NOT EXISTS vector;");
  db = drizzle(client, { schema });
  holder.db = db;
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.user).values([
    { id: "u1", name: "Owner", email: "o@x.dev", githubLogin: "acme", githubId: "1" },
    { id: "u2", name: "Other", email: "t@x.dev", githubLogin: "other", githubId: "2" },
  ]);
}, 60_000);

async function seed(statuses: ("done" | "error")[]) {
  const [repo] = await db.insert(schema.repos).values({ owner: "Acme", name: "widgets", defaultBranch: "main" }).onConflictDoUpdate({ target: [schema.repos.owner, schema.repos.name], set: { defaultBranch: "main" } }).returning();
  const [gen] = await db.insert(schema.generations).values({ repoId: repo.id, commitSha: "abc1234", branch: "main" }).returning();
  await db.insert(schema.pages).values(
    statuses.map((status, i) => ({ generationId: gen.id, slug: `p${i}`, title: `Page ${i}`, position: i, status, markdown: status === "done" ? `# p${i}` : null })),
  );
  const job = await createJob({ owner: "Acme", name: "widgets", userId: "u1", clientIp: "1.1.1.1", generationId: gen.id });
  return { repo, gen, job };
}

describe("persistence (pglite)", () => {
  it("finalizes a partial generation, swaps pointer, serves wiki case-insensitively", async () => {
    const { repo, gen, job } = await seed(["done", "error", "done"]);
    await finalizeGeneration(gen.id, job.id);

    const j = await getJob(job.id);
    expect(j?.status).toBe("done");
    expect(j?.errorCode).toBe("PARTIAL");
    expect(toView(j!).wikiPath).toBe("/wiki/Acme/widgets");

    const [r] = await db.select().from(schema.repos).where(eq(schema.repos.id, repo.id));
    expect(r.currentGenerationId).toBe(gen.id);

    const meta = await readMeta("acme", "WIDGETS", null);
    expect(meta?.status).toBe("partial");
    expect(meta?.pages.map((p) => p.slug)).toEqual(["p0", "p2"]);
    expect(await readPage(meta!.generationId, "p0")).toBe("# p0");
    expect(await readPage(meta!.generationId, "p1")).toBeNull();
    expect(await readMeta("../etc", "passwd", null)).toBeNull();
  });

  it("marks the job failed when no page succeeded and keeps the previous wiki", async () => {
    const before = await readMeta("acme", "widgets", null);
    const { gen, job } = await seed(["error", "error"]);
    await finalizeGeneration(gen.id, job.id);
    expect((await getJob(job.id))?.status).toBe("error");
    expect((await readMeta("acme", "widgets", null))?.generationId).toBe(before?.generationId);
  });

  it("does not publish a generation after its job was cancelled", async () => {
    const { repo, gen, job } = await seed(["done"]);
    const [before] = await db.select({ generationId: schema.repos.currentGenerationId }).from(schema.repos).where(eq(schema.repos.id, repo.id));
    await db.update(schema.jobs).set({ status: "error", errorCode: "CANCELLED" }).where(eq(schema.jobs.id, job.id));
    await finalizeGeneration(gen.id, job.id);
    expect((await getJob(job.id))?.errorCode).toBe("CANCELLED");
    const [persistedRepo] = await db.select().from(schema.repos).where(eq(schema.repos.id, repo.id));
    expect(persistedRepo.currentGenerationId).toBe(before.generationId);
  });

  it("prunes old generations", async () => {
    for (let i = 0; i < 4; i++) {
      const { gen, job } = await seed(["done"]);
      await finalizeGeneration(gen.id, job.id);
    }
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.generations);
    expect(n).toBeLessThanOrEqual(5);
  });

  it("tracks one active job per repository", async () => {
    await createJob({ owner: "a", name: "b", userId: "u1", clientIp: "2.2.2.2" });
    expect((await findActiveJob("A", "B"))?.name).toBe("b");
    expect(await findActiveJob("a", "other")).toBeUndefined();
  });

  it("hides private wikis from everyone but the owner", async () => {
    const { repo, gen } = await seed(["done"]);
    await db.update(schema.repos).set({ ownerUserId: "u1", visibility: "private" }).where(eq(schema.repos.id, repo.id));
    await db.update(schema.repos).set({ currentGenerationId: gen.id }).where(eq(schema.repos.id, repo.id));
    await db.update(schema.generations).set({ status: "done", finishedAt: new Date() }).where(eq(schema.generations.id, gen.id));
    expect(await readMeta("acme", "widgets", null)).toBeNull();
    expect(await readMeta("acme", "widgets", { id: "u2" })).toBeNull();
    expect((await readMeta("acme", "widgets", { id: "u1" }))?.isOwner).toBe(true);
    await db.update(schema.repos).set({ visibility: "public" }).where(eq(schema.repos.id, repo.id));
    const pub = await readMeta("acme", "widgets", { id: "u2" });
    expect(pub?.isOwner).toBe(false);
  });

  it("deletes an owned wiki and leaves queued jobs cancelled", async () => {
    const { repo, gen, job } = await seed(["done"]);
    await db.update(schema.repos).set({ ownerUserId: "u1" }).where(eq(schema.repos.id, repo.id));
    const history = await createJob({ owner: "Acme", name: "widgets", userId: "u1", clientIp: "1.1.1.1", status: "done", repoId: repo.id, generationId: gen.id });
    expect(await deleteRepoWiki("u1", "acme", "WIDGETS")).toBe(true);
    expect((await getJob(job.id))?.errorCode).toBe("CANCELLED");
    expect(await getJob(history.id)).toMatchObject({ status: "done", repoId: null, generationId: null });
    expect(await readMeta("acme", "widgets", { id: "u1" })).toBeNull();
    expect(await db.select().from(schema.generations).where(eq(schema.generations.id, gen.id))).toHaveLength(0);
    expect(await deleteRepoWiki("u2", "acme", "widgets")).toBe(false);
  });

  it("reconciles idempotent token reservations to actual model usage", async () => {
    const { repo, gen } = await seed(["done"]);
    await db.update(schema.repos).set({ ownerUserId: "u1" }).where(eq(schema.repos.id, repo.id));
    const reservation = await assertTokenBudget(gen.id, "write:p0", 20_000);
    await assertTokenBudget(gen.id, "write:p0", 20_000);
    await settleTokenBudget(reservation, 321);

    const budgetKeys = [`generation:${gen.id}`, `daily:u1:${new Date().toISOString().slice(0, 10)}`, reservation.key];
    const rows = await db.select({ key: schema.tokenBudgets.key, tokensReserved: schema.tokenBudgets.tokensReserved })
      .from(schema.tokenBudgets).where(inArray(schema.tokenBudgets.key, budgetKeys));
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.tokensReserved === 321)).toBe(true);

    const released = await assertTokenBudget(gen.id, "write:p1", 10_000);
    await releaseTokenBudget(released);
    const [generationBudget] = await db.select({ tokensReserved: schema.tokenBudgets.tokensReserved })
      .from(schema.tokenBudgets).where(eq(schema.tokenBudgets.key, `generation:${gen.id}`));
    expect(generationBudget.tokensReserved).toBe(321);
  });

  it("stores embeddings and full-text vectors", async () => {
    const { gen } = await seed(["done"]);
    const embedding = Array.from({ length: schema.EMBED_DIMS }, (_, i) => (i === 0 ? 1 : 0));
    await db.insert(schema.chunks).values({ generationId: gen.id, path: "a.ts", startLine: 1, endLine: 3, content: "export function hello() {}", embedding });
    const nearest = await db.execute(sql`select path from chunks order by embedding <=> ${JSON.stringify(embedding)}::vector limit 1`);
    expect(nearest.rows[0]).toEqual({ path: "a.ts" });
    const fts = await db.execute(sql`select path from chunks where tsv @@ plainto_tsquery('english', 'hello')`);
    expect(fts.rows).toHaveLength(1);
  });

  it("indexes wiki pages and lists only public wikis", async () => {
    const { repo, gen } = await seed(["done"]);
    await db.update(schema.repos).set({ ownerUserId: "u1", visibility: "public", currentGenerationId: gen.id }).where(eq(schema.repos.id, repo.id));
    await db.update(schema.generations).set({ status: "done", finishedAt: new Date() }).where(eq(schema.generations.id, gen.id));
    await db.update(schema.pages).set({ title: "Payment lifecycle", summary: "How refunds are processed", markdown: "# Chargeback handling" }).where(eq(schema.pages.generationId, gen.id));
    const matches = await db.execute(sql`select slug from pages where generation_id = ${gen.id} and tsv @@ plainto_tsquery('english', 'chargeback')`);
    expect(matches.rows).toHaveLength(1);
    expect((await listPublicWikis()).some((wiki) => wiki.owner === "Acme" && wiki.name === "widgets")).toBe(true);
    await db.update(schema.repos).set({ visibility: "private" }).where(eq(schema.repos.id, repo.id));
    expect((await listPublicWikis()).some((wiki) => wiki.owner === "Acme" && wiki.name === "widgets")).toBe(false);
  });

  it("hybrid search fuses vector and full-text hits", async () => {
    const { gen } = await seed(["done"]);
    const unit = (i: number) => Array.from({ length: schema.EMBED_DIMS }, (_, j) => (j === i ? 1 : 0));
    await db.insert(schema.chunks).values([
      { generationId: gen.id, path: "a.ts", startLine: 1, endLine: 5, content: "function parseConfig reads yaml", embedding: unit(0) },
      { generationId: gen.id, path: "b.ts", startLine: 1, endLine: 5, content: "renders the sidebar component", embedding: unit(1) },
    ]);
    const byVector = await hybridSearch(gen.id, "zzz", 2, unit(1));
    expect(byVector[0].path).toBe("b.ts");
    const byText = await hybridSearch(gen.id, "how is config parsed? parseConfig", 2, null);
    expect(byText[0].path).toBe("a.ts");
    expect(toOrQuery("How does it work?")).toBe("how or does or work");
  });
});
