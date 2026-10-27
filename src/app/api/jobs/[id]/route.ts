import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";


export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const { status, step, progress, repo, wikiPath, error } = job;
  return NextResponse.json({ status, step, progress, repo, wikiPath, error });
}
