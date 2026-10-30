import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { readMeta } from "@/lib/wiki-store";

export async function GET(req: Request, ctx: { params: Promise<{ user: string; repo: string }> }) {
  const { user, repo } = await ctx.params;
  const query = new URL(req.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });
  const meta = await readMeta(user, repo, await getCurrentUser());
  if (!meta) return NextResponse.json({ error: "Wiki not found" }, { status: 404 });
  const rank = sql<number>`ts_rank(${pages.tsv}, plainto_tsquery('english', ${query}))`;
  const results = await db()
    .select({ slug: pages.slug, title: pages.title, summary: pages.summary, rank })
    .from(pages)
    .where(and(eq(pages.generationId, meta.generationId), eq(pages.status, "done"), sql`${pages.tsv} @@ plainto_tsquery('english', ${query})`))
    .orderBy(desc(rank))
    .limit(10);
  return NextResponse.json({ results: results.map(({ slug, title, summary }) => ({ slug, title, summary })) });
}
