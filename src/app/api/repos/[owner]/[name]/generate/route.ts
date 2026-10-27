import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/http";
import { SAFE_SEGMENT } from "@/lib/repo-url";
import { startGeneration } from "@/lib/start-generation";
import { getClientIp } from "@/lib/client-ip";

const Body = z.object({ force: z.boolean().optional() }).optional();

export async function POST(req: Request, ctx: { params: Promise<{ owner: string; name: string }> }) {
  const { owner, name } = await ctx.params;
  if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(name)) return NextResponse.json({ error: "Invalid repository" }, { status: 400 });
  try {
    const user = await requireUser();
    const body = Body.parse(await req.json().catch(() => undefined));
    const res = await startGeneration(user, owner, name, { force: body?.force, clientIp: await getClientIp() });
    if (res.kind === "busy") return NextResponse.json({ error: "busy", currentRepo: `${owner}/${name}`, jobId: res.jobId }, { status: 409 });
    return NextResponse.json({ jobId: res.jobId, reused: res.kind === "reused" });
  } catch (e) {
    return errorResponse(e, "POST generate");
  }
}
