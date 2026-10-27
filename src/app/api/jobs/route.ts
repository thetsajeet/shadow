import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { generations } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { generateRequested } from "@/inngest/events";
import { ShadowError, toShadowError, type ErrorCode } from "@/lib/errors";
import { fetchRepoInfo, getHeadSha } from "@/lib/github";
import { countRecentJobs, createJob, findActiveJob, updateJob } from "@/lib/jobs";
import { logger } from "@/lib/logger";
import { parseRepoUrl } from "@/lib/repo-url";
import { getClientIp, getSessionId } from "@/lib/session";
import { findRepo } from "@/lib/wiki-store";

const Body = z.object({ url: z.string().min(1).max(300), force: z.boolean().optional() });
const HOUR = 60 * 60_000;
const LIMIT_PER_IP = 10;
const LIMIT_PER_SESSION = 5;

const STATUS: Record<ErrorCode, number> = {
  INVALID_URL: 400,
  NOT_FOUND: 404,
  PRIVATE: 404,
  TOO_LARGE: 422,
  RATE_LIMITED: 503,
  INGEST_FAILED: 502,
  LLM_ERROR: 502,
  BUSY: 409,
  TIMEOUT: 504,
  INTERNAL: 500,
};

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Request body must be { url }" }, { status: 400 });

  try {
    const ref = parseRepoUrl(parsed.data.url);
    const sessionId = await getSessionId();
    const clientIp = await getClientIp();

    const active = await findActiveJob(sessionId);
    if (active) {
      return NextResponse.json({ error: "busy", currentRepo: `${active.owner}/${active.name}`, jobId: active.id }, { status: 409 });
    }
    if ((await countRecentJobs({ clientIp }, HOUR)) >= LIMIT_PER_IP || (await countRecentJobs({ sessionId }, HOUR)) >= LIMIT_PER_SESSION) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    // Validate synchronously so bad repos fail fast without queueing.
    const info = await fetchRepoInfo(ref);
    const sha = await getHeadSha(ref, info.defaultBranch);

    const existing = await findRepo(info.owner, info.name);
    if (existing?.currentGenerationId && !parsed.data.force) {
      const [gen] = await db().select().from(generations).where(eq(generations.id, existing.currentGenerationId));
      if (gen?.commitSha === sha) {
        const job = await createJob({
          owner: info.owner, name: info.name, sessionId, clientIp,
          status: "done", step: "Up to date", repoId: existing.id, generationId: gen.id,
        });
        return NextResponse.json({ jobId: job.id, reused: true });
      }
    }

    const job = await createJob({ owner: info.owner, name: info.name, sessionId, clientIp });
    try {
      await inngest.send(generateRequested.create({ jobId: job.id, owner: info.owner, name: info.name, sessionId }));
    } catch (e) {
      logger.error({ err: e, jobId: job.id }, "failed to enqueue generation");
      await updateJob(job.id, { status: "error", step: "Failed", errorCode: "INTERNAL", errorMessage: "Could not enqueue the job." });
      return NextResponse.json({ error: "Could not enqueue the job." }, { status: 502 });
    }
    return NextResponse.json({ jobId: job.id });
  } catch (e) {
    const err = toShadowError(e);
    if (!(e instanceof ShadowError)) logger.error({ err: e }, "POST /api/jobs failed");
    return NextResponse.json({ error: err.message, code: err.code }, { status: STATUS[err.code] });
  }
}
