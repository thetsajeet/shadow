import { and, asc, eq, sql } from "drizzle-orm";
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
    isOwner: canManage(repo, viewer),
    pages: rows,
  };
}

export async function readPage(generationId: string, slug: string): Promise<string | null> {
  if (!validSegments(slug)) return null;
  const [row] = await db()
    .select({ markdown: pages.markdown })
    .from(pages)
    .where(and(eq(pages.generationId, generationId), eq(pages.slug, slug), eq(pages.status, "done")));
  return row?.markdown ?? null;
}
