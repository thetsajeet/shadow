import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({ db: () => holder.db, schema: undefined }));

const { finalizeGeneration } = await import("../generation");
const { createJob, getJob, findActiveJob, toView } = await import("../jobs");
const { readMeta, readPage } = await import("../wiki-store");

let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  const client = new PGlite({ extensions: { vector } });
  await client.exec("CREATE EXTENSION IF NOT EXISTS vector;");
  db = drizzle(client, { schema });
  holder.db = db;
  await migrate(db, { migrationsFolder: "./drizzle" });
}, 60_000);

async function seed(statuses: ("done" | "error")[]) {
  const [repo] = await db.insert(schema.repos).values({ owner: "Acme", name: "widgets", defaultBranch: "main" }).onConflictDoUpdate({ target: [schema.repos.owner, schema.repos.name], set: { defaultBranch: "main" } }).returning();
  const [gen] = await db.insert(schema.generations).values({ repoId: repo.id, commitSha: "abc1234", branch: "main" }).returning();
  await db.insert(schema.pages).values(
    statuses.map((status, i) => ({ generationId: gen.id, slug: `p${i}`, title: `Page ${i}`, position: i, status, markdown: status === "done" ? `# p${i}` : null })),
  );
  const job = await createJob({ owner: "Acme", name: "widgets", sessionId: "s1", clientIp: "1.1.1.1", generationId: gen.id });
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

    const meta = await readMeta("acme", "WIDGETS");
    expect(meta?.status).toBe("partial");
    expect(meta?.pages.map((p) => p.slug)).toEqual(["p0", "p2"]);
    expect(await readPage(meta!.generationId, "p0")).toBe("# p0");
    expect(await readPage(meta!.generationId, "p1")).toBeNull();
    expect(await readMeta("../etc", "passwd")).toBeNull();
  });

  it("marks the job failed when no page succeeded and keeps the previous wiki", async () => {
    const before = await readMeta("acme", "widgets");
    const { gen, job } = await seed(["error", "error"]);
    await finalizeGeneration(gen.id, job.id);
    expect((await getJob(job.id))?.status).toBe("error");
    expect((await readMeta("acme", "widgets"))?.generationId).toBe(before?.generationId);
  });

  it("prunes old generations", async () => {
    for (let i = 0; i < 4; i++) {
      const { gen, job } = await seed(["done"]);
      await finalizeGeneration(gen.id, job.id);
    }
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.generations);
    expect(n).toBeLessThanOrEqual(5);
  });

  it("tracks one active job per session", async () => {
    await createJob({ owner: "a", name: "b", sessionId: "sess-x", clientIp: "2.2.2.2" });
    expect((await findActiveJob("sess-x"))?.name).toBe("b");
    expect(await findActiveJob("other")).toBeUndefined();
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
});
