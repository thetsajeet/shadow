import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/http";
import { SAFE_SEGMENT } from "@/lib/repo-url";
import { assertOwnsRepo } from "@/lib/start-generation";
import { deleteRepoWiki } from "@/lib/delete-repo";

export async function DELETE(_req: Request, ctx: { params: Promise<{ owner: string; name: string }> }) {
  const { owner, name } = await ctx.params;
  if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(name)) return NextResponse.json({ error: "Invalid repository" }, { status: 400 });
  try {
    const user = await requireUser();
    assertOwnsRepo(user, owner);
    if (!(await deleteRepoWiki(user.id, owner, name))) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (e) {
    return errorResponse(e, "DELETE repo");
  }
}
