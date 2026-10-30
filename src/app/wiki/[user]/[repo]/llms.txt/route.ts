import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { readMeta } from "@/lib/wiki-store";

export async function GET(_req: Request, ctx: { params: Promise<{ user: string; repo: string }> }) {
  const { user, repo } = await ctx.params;
  const meta = await readMeta(user, repo, await getCurrentUser());
  if (!meta) return new Response("Not found", { status: 404 });
  const url = `${new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin}/wiki/${encodeURIComponent(user)}/${encodeURIComponent(repo)}`;
  const content = [
    `# ${meta.repo}`,
    "",
    `> Documentation for ${meta.repo}, generated from commit ${meta.sha.slice(0, 7)} on ${meta.branch}.`,
    `> License: ${meta.license ?? "not identified"}.`,
    "",
    "## Wiki pages",
    "",
    ...meta.pages.map((page) => `- [${page.title}](${url}/${page.slug}): ${page.summary}`),
    "",
  ].join("\n");
  return new NextResponse(content, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" },
  });
}
