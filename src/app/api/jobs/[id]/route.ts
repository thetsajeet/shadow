import { NextResponse } from "next/server";
import { z } from "zod";
import { getJob, toView } from "@/lib/jobs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(toView(job), { headers: { "Cache-Control": "no-store" } });
}
