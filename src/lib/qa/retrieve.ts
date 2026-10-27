import { sql } from "drizzle-orm";
import { db } from "@/db";
import { logger } from "../logger";
import { embedTexts } from "./embed";

export interface Hit {
  id: string;
  path: string;
  kind: "code" | "wiki";
  startLine: number;
  endLine: number;
  content: string;
  score: number;
}

function rowsOf<T>(res: unknown): T[] {
  return Array.isArray(res) ? (res as T[]) : ((res as { rows?: T[] }).rows ?? []);
}

/** Turns a natural-language question into an OR-style full-text query. */
export function toOrQuery(q: string): string {
  const words = q.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? [];
  return [...new Set(words)].slice(0, 12).join(" or ");
}

/** Hybrid search: pgvector cosine + Postgres full-text, fused with reciprocal rank fusion. */
export async function hybridSearch(generationId: string, query: string, k = 8, embedding?: number[] | null): Promise<Hit[]> {
  let vec = embedding;
  if (vec === undefined) {
    try {
      vec = (await embedTexts([query], "query"))[0];
    } catch (e) {
      logger.warn({ err: e }, "query embedding failed; falling back to full-text only");
      vec = null;
    }
  }
  const vectorLiteral = vec ? JSON.stringify(vec) : null;
  const ts = toOrQuery(query);
  const res = await db().execute(sql`
    with v as (
      select id, row_number() over (order by embedding <=> ${vectorLiteral}::vector) as rn
      from chunks
      where generation_id = ${generationId} and embedding is not null and ${vectorLiteral}::text is not null
      order by embedding <=> ${vectorLiteral}::vector
      limit 30
    ),
    f as (
      select id, row_number() over (order by ts_rank_cd(tsv, q) desc) as rn
      from chunks, websearch_to_tsquery('english', ${ts}) q
      where generation_id = ${generationId} and ${ts} <> '' and tsv @@ q
      order by ts_rank_cd(tsv, q) desc
      limit 30
    )
    select c.id, c.path, c.kind, c.start_line as "startLine", c.end_line as "endLine", c.content,
           (coalesce(1.0 / (60 + v.rn), 0) + coalesce(1.0 / (60 + f.rn), 0))::float as score
    from chunks c
    left join v on v.id = c.id
    left join f on f.id = c.id
    where v.id is not null or f.id is not null
    order by score desc
    limit ${k}
  `);
  return rowsOf<Hit>(res);
}
