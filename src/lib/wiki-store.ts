import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { generations, pages, repos } from "@/db/schema";
import { canManage, canView, type Viewer } from "./access";
import { SAFE_SEGMENT } from "./repo-url";

export interface WikiPageMeta {
  slug: string;
  title: string;
  summary: string;
  parentSlug: string | null;
}

export interface WikiMeta {
  repoId: string;
  generationId: string;
  repo: string;
  branch: string;
  sha: string;
  generatedAt: string;
  status: "done" | "partial";
  visibility: "public" | "private";
  license: string | null;
  isOwner: boolean;
  pages: WikiPageMeta[];
}

function validSegments(...s: string[]) {
  return s.every((x) => SAFE_SEGMENT.test(x) && x !== "." && x !== "..");
}

export async function findRepo(user: string, name: string) {
  if (!validSegments(user, name)) return null;
  const [row] = await db()
    .select()
    .from(repos)
    .where(and(sql`lower(${repos.owner}) = ${user.toLowerCase()}`, sql`lower(${repos.name}) = ${name.toLowerCase()}`));
  return row ?? null;
}

/** Metadata for the repo's current (last successful) generation, or null when missing or not visible to the viewer. */
export async function readMeta(user: string, name: string, viewer: Viewer | null): Promise<WikiMeta | null> {
  const repo = await findRepo(user, name);
  // Non-viewers get the same "not found" as a missing wiki so private repos are not leaked.
  if (!repo?.currentGenerationId || !canView(repo, viewer)) return null;
  const [gen] = await db().select().from(generations).where(eq(generations.id, repo.currentGenerationId));
  if (!gen || (gen.status !== "done" && gen.status !== "partial")) return null;
  const rows = await db()
    .select({ slug: pages.slug, title: pages.title, summary: pages.summary, parentSlug: pages.parentSlug })
    .from(pages)
    .where(and(eq(pages.generationId, gen.id), eq(pages.status, "done")))
    .orderBy(asc(pages.position));
  return {
    repoId: repo.id,
    generationId: gen.id,
    repo: `${repo.owner}/${repo.name}`,
    branch: gen.branch,
    sha: gen.commitSha,
    generatedAt: (gen.finishedAt ?? gen.startedAt).toISOString(),
    status: gen.status,
    visibility: repo.visibility,
    license: repo.license,
    isOwner: canManage(repo, viewer),
    pages: rows,
  };
}

export interface PublicWikiSummary {
  owner: string;
  name: string;
  description: string | null;
  branch: string;
  sha: string;
  generatedAt: string;
  pageCount: number;
}

export async function listPublicWikis(limit = 50): Promise<PublicWikiSummary[]> {
  const rows = await db()
    .select({
      owner: repos.owner,
      name: repos.name,
      description: repos.description,
      branch: generations.branch,
      sha: generations.commitSha,
      generatedAt: generations.finishedAt,
      pageCount: count(pages.id),
    })
    .from(repos)
    .innerJoin(generations, eq(generations.id, repos.currentGenerationId))
    .leftJoin(pages, and(eq(pages.generationId, generations.id), eq(pages.status, "done")))
    .where(and(eq(repos.visibility, "public"), sql`${generations.status} IN ('done', 'partial')`))
    .groupBy(repos.id, generations.id)
    .orderBy(desc(generations.finishedAt))
    .limit(limit);
  return rows.map((row) => ({
    owner: row.owner,
    name: row.name,
    description: row.description,
    branch: row.branch,
    sha: row.sha,
    generatedAt: (row.generatedAt ?? new Date()).toISOString(),
    pageCount: row.pageCount,
  }));
}

export async function readPage(generationId: string, slug: string): Promise<string | null> {
  if (!validSegments(slug)) return null;
  const [row] = await db()
    .select({ markdown: pages.markdown })
    .from(pages)
    .where(and(eq(pages.generationId, generationId), eq(pages.slug, slug), eq(pages.status, "done")));
  return row?.markdown ?? null;
}
