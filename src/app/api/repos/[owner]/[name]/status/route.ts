import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/http";
import { getRepoStatus } from "@/lib/repo-status";
import { SAFE_SEGMENT } from "@/lib/repo-url";

export async function GET(_req: Request, ctx: { params: Promise<{ owner: string; name: string }> }) {
  const { owner, name } = await ctx.params;
  if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(name)) return NextResponse.json({ error: "Invalid repository" }, { status: 400 });
  try {
    const user = await requireUser();
    return NextResponse.json(await getRepoStatus(user.id, owner, name), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "GET status");
  }
}
