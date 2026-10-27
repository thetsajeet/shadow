import { NextResponse } from "next/server";
import { z } from "zod";
import { parseRepoUrl, ShadowError } from "@/lib/github";
import { runWikiGraph } from "@/lib/graph";
import { currentRepo, tryCreateJob, runJob } from "@/lib/jobs";

export const runtime = "nodejs";

const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 15 * 60_000);
const Body = z.object({ url: z.string().min(1).max(300) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Request body must be { url }" }, { status: 400 });
  }
  let ref;
  try {
    ref = parseRepoUrl(parsed.data.url);
  } catch (e) {
    const msg = e instanceof ShadowError ? e.message : "Invalid URL";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const repoName = `${ref.user}/${ref.repo}`;
  const job = tryCreateJob(repoName);
  if (!job) {
    return NextResponse.json({ error: "busy", currentRepo: currentRepo() }, { status: 409 });
  }

  const controller = new AbortController();
  // fire and forget; runJob always releases the lock in finally
  void runJob(
    job,
    async () => {
      try {
        return await runWikiGraph(job.id, ref.user, ref.repo, controller.signal);
      } catch (e) {
        controller.abort();
        throw e;
      }
    },
    JOB_TIMEOUT_MS,
    () => controller.abort(),
  );
  return NextResponse.json({ jobId: job.id });
}
