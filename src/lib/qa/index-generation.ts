import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { chunks, generations, pages, repoFiles } from "@/db/schema";
import { logger } from "../logger";
import { chunkCode, chunkMarkdown, type Chunk } from "./chunk";
import { embedTexts } from "./embed";
import { addTokens } from "../generation";
import { assertTokenBudget, releaseTokenBudget, settleTokenBudget } from "../security-controls";
import { selectedEmbeddingModel } from "../pipeline/models";

const MAX_CHUNKS = 4000;

interface Pending extends Chunk {
  path: string;
  blobSha: string | null;
  kind: "code" | "wiki";
}

const key = (blobSha: string, s: number, e: number) => `${blobSha}:${s}:${e}`;

/** Chunks code and wiki pages for a generation and embeds them, reusing vectors of unchanged files by blob SHA. */
export async function indexGeneration(generationId: string): Promise<{ chunks: number; embedded: number; reused: number }> {
  const [gen] = await db().select().from(generations).where(eq(generations.id, generationId));
  if (!gen) throw new Error(`Generation ${generationId} not found`);

  const files = await db()
    .select({ path: repoFiles.path, blobSha: repoFiles.blobSha, content: repoFiles.content })
    .from(repoFiles)
    .where(eq(repoFiles.generationId, generationId));
  const wiki = await db()
    .select({ slug: pages.slug, markdown: pages.markdown })
    .from(pages)
    .where(and(eq(pages.generationId, generationId), eq(pages.status, "done")));

  const pending: Pending[] = [];
  for (const f of files) for (const c of chunkCode(f.content)) pending.push({ ...c, path: f.path, blobSha: f.blobSha, kind: "code" });
  for (const p of wiki) {
    if (p.markdown) for (const c of chunkMarkdown(p.markdown)) pending.push({ ...c, path: `wiki/${p.slug}`, blobSha: null, kind: "wiki" });
  }
  const capped = pending.slice(0, MAX_CHUNKS);

  const prevGens = await db()
    .select({ id: generations.id })
    .from(generations)
    .where(and(eq(generations.repoId, gen.repoId), ne(generations.id, generationId)));
  const cache = new Map<string, string>();
  const blobs = [...new Set(capped.flatMap((c) => (c.blobSha ? [c.blobSha] : [])))];
  if (prevGens.length && blobs.length) {
    for (let i = 0; i < blobs.length; i += 500) {
      const rows = await db()
        .select({ blobSha: chunks.blobSha, s: chunks.startLine, e: chunks.endLine, embedding: chunks.embedding })
        .from(chunks)
        .where(
          and(
            inArray(chunks.generationId, prevGens.map((g) => g.id)),
            inArray(chunks.blobSha, blobs.slice(i, i + 500)),
            isNotNull(chunks.embedding),
          ),
        );
      for (const r of rows) if (r.blobSha && r.embedding) cache.set(key(r.blobSha, r.s, r.e), JSON.stringify(r.embedding));
    }
  }

  const misses = capped.filter((c) => !(c.blobSha && cache.has(key(c.blobSha, c.startLine, c.endLine))));
  const embeddingTokens = Math.ceil(misses.reduce((n, c) => n + c.content.length + c.path.length + 1, 0) / 4);
  const reservation = embeddingTokens > 0
    ? await assertTokenBudget(generationId, "index", embeddingTokens)
    : null;
  let vectors: number[][];
  try {
    vectors = await embedTexts(
      misses.map((c) => `${c.path}\n${c.content}`),
      "document",
    );
  } catch (error) {
    if (reservation) await releaseTokenBudget(reservation);
    throw error;
  }
  if (reservation) {
    await settleTokenBudget(reservation, embeddingTokens);
    await addTokens(generationId, embeddingTokens, 0, selectedEmbeddingModel());
  }
  const fresh = new Map(misses.map((c, i) => [c, vectors[i]]));

  await db().delete(chunks).where(eq(chunks.generationId, generationId));
  const rows = capped.map((c) => {
    const cached = c.blobSha ? cache.get(key(c.blobSha, c.startLine, c.endLine)) : undefined;
    return {
      generationId,
      path: c.path,
      blobSha: c.blobSha,
      kind: c.kind,
      startLine: c.startLine,
      endLine: c.endLine,
      content: c.content,
      embedding: cached ? (JSON.parse(cached) as number[]) : (fresh.get(c) ?? null),
    };
  });
  for (let i = 0; i < rows.length; i += 200) await db().insert(chunks).values(rows.slice(i, i + 200));
  const stats = { chunks: rows.length, embedded: misses.length, reused: rows.length - misses.length };
  logger.info({ generationId, ...stats }, "generation indexed");
  return stats;
}
