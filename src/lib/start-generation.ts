import { eq } from "drizzle-orm";
import { db } from "@/db";
import { generations } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { generateRequested } from "@/inngest/events";
import type { CurrentUser } from "./current-user";
import { ShadowError } from "./errors";
import { fetchRepoInfo, getHeadSha } from "./github";
import { countRecentJobs, createJob, findActiveJob, updateJob } from "./jobs";
import { logger } from "./logger";
import { getUserGithubToken } from "./user-token";
import { findRepo } from "./wiki-store";

const HOUR = 60 * 60_000;
export const JOBS_PER_USER_PER_HOUR = 10;

export type StartResult =
  | { kind: "started"; jobId: string }
  | { kind: "reused"; jobId: string }
  | { kind: "busy"; jobId: string };

/** Only a repository's owner may generate its wiki; the GitHub login must match the signed-in user. */
export function assertOwnsRepo(user: CurrentUser, owner: string) {
  if (owner.toLowerCase() !== user.githubLogin.toLowerCase()) {
    throw new ShadowError("FORBIDDEN", "You can only generate documentation for repositories you own.");
  }
}

export async function startGeneration(user: CurrentUser, owner: string, name: string, opts: { sync?: boolean; clientIp: string }): Promise<StartResult> {
  assertOwnsRepo(user, owner);
  const active = await findActiveJob(owner, name);
  if (active) return { kind: "busy", jobId: active.id };
  if ((await countRecentJobs(user.id, HOUR)) >= JOBS_PER_USER_PER_HOUR) {
    throw new ShadowError("RATE_LIMITED", "You have started too many generations. Please try again later.", true);
  }

  // Validate synchronously with the owner's token so bad or inaccessible repos fail fast without queueing.
  const token = await getUserGithubToken(user.id);
  const info = await fetchRepoInfo({ user: owner, repo: name }, token);
  const sha = await getHeadSha({ user: owner, repo: name }, info.defaultBranch, token);

  const existing = await findRepo(info.owner, info.name);
  if (opts.sync && (!existing?.currentGenerationId || existing.ownerUserId !== user.id)) {
    throw new ShadowError("NOT_FOUND", "This repository has no documentation to sync yet.");
  }
  // Never spend tokens when the wiki already matches the branch head.
  if (existing?.currentGenerationId) {
    const [gen] = await db().select().from(generations).where(eq(generations.id, existing.currentGenerationId));
    if (gen?.commitSha === sha) {
      const job = await createJob({
        owner: info.owner, name: info.name, userId: user.id, clientIp: opts.clientIp,
        status: "done", step: "Up to date", repoId: existing.id, generationId: gen.id,
      });
      return { kind: "reused", jobId: job.id };
    }
  }

  const job = await createJob({ owner: info.owner, name: info.name, userId: user.id, clientIp: opts.clientIp });
  try {
    await inngest.send(generateRequested.create({ jobId: job.id, owner: info.owner, name: info.name, userId: user.id, baseGenerationId: opts.sync ? existing?.currentGenerationId ?? undefined : undefined }));
  } catch (e) {
    logger.error({ err: e, jobId: job.id }, "failed to enqueue generation");
    await updateJob(job.id, { status: "error", step: "Failed", errorCode: "INTERNAL", errorMessage: "Could not enqueue the job." });
    throw new ShadowError("INTERNAL", "Could not enqueue the job.");
  }
  return { kind: "started", jobId: job.id };
}
