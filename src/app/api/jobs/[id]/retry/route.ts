import { NextResponse } from "next/server";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { retryRequested } from "@/inngest/events";
import { getJob, updateJob } from "@/lib/jobs";
import { getCurrentUser } from "@/lib/current-user";
import { assertGenerationAllowed, enforceRequestControls } from "@/lib/security-controls";
import { errorResponse } from "@/lib/http";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const job = await getJob(id);
  const user = await getCurrentUser();
  if (!user || !job || job.userId !== user.id) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  try {
    await assertGenerationAllowed();
    await enforceRequestControls(req, "generate");
  } catch (e) {
    return errorResponse(e, "POST retry admission");
  }
  if (job.errorCode !== "PARTIAL" || !job.generationId) {
    return NextResponse.json({ error: "Nothing to retry" }, { status: 400 });
  }
  await updateJob(id, { status: "queued", step: "Queued for retry" });
  await inngest.send(
    retryRequested.create({ jobId: id, generationId: job.generationId, owner: job.owner, name: job.name, userId: user.id }),
  );
  return NextResponse.json({ jobId: id });
}
