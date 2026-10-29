import { zipSync, strToU8 } from "fflate";
import { and, asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { pages, repoFiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { readMeta, readPage } from "@/lib/wiki-store";

export async function GET(_req: Request, ctx: { params: Promise<{ user: string; repo: string }> }) {
  const { user, repo } = await ctx.params;
  const meta = await readMeta(user, repo, await getCurrentUser());
  if (!meta) return NextResponse.json({ error: "Wiki not found" }, { status: 404 });
  const rows = await db()
    .select({ slug: pages.slug, title: pages.title })
    .from(pages)
    .where(eq(pages.generationId, meta.generationId))
    .orderBy(asc(pages.position));
  const files: Record<string, Uint8Array> = {};
  const index = [`# ${meta.repo} wiki`, "", `Branch: ${meta.branch}`, `Commit: ${meta.sha}`, `License: ${meta.license ?? "not identified"}`, "", "## Pages", ""];
  for (const page of rows) {
    const markdown = await readPage(meta.generationId, page.slug);
    if (markdown === null) continue;
    files[`pages/${page.slug}.md`] = strToU8(markdown);
    index.push(`- [${page.title}](pages/${page.slug}.md)`);
  }
  files["README.md"] = strToU8(index.join("\n"));
  const [license] = await db()
    .select({ path: repoFiles.path, content: repoFiles.content })
    .from(repoFiles)
    .where(and(eq(repoFiles.generationId, meta.generationId), sql`${repoFiles.path} ~* '^(LICENSE|NOTICE)(\\.[A-Za-z0-9._-]+)?$'`))
    .limit(1);
  if (license) files[`source-notices/${license.path.split("/").at(-1) ?? "LICENSE"}`] = strToU8(license.content);
  const archive = zipSync(files, { level: 6 });
  return new Response(Buffer.from(archive), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${user}-${repo}-wiki.zip"`,
      "cache-control": "private, no-store",
    },
  });
}
