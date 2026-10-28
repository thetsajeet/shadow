import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";

export type JobRow = typeof jobs.$inferSelect;

export interface JobView {
  status: JobRow["status"];
  step: string;
  progress: { done: number; total: number };
  repo: string;
  wikiPath?: string;
  error?: string;
  errorCode?: string;
}

const STALE_MS = 30 * 60_000;

export async function createJob(input: {
  owner: string;
  name: string;
  userId: string;
  clientIp: string;
  status?: JobRow["status"];
  generationId?: string;
  repoId?: string;
  step?: string;
}) {
  const [row] = await db().insert(jobs).values(input).returning();
  return row;
}

export async function getJob(id: string): Promise<JobRow | undefined> {
  const [row] = await db().select().from(jobs).where(eq(jobs.id, id));
  return row;
}

export async function updateJob(id: string, patch: Partial<Omit<JobRow, "id" | "createdAt">>) {
  await db().update(jobs).set({ ...patch, updatedAt: new Date() }).where(eq(jobs.id, id));
}

export async function incrementJobDone(id: string) {
  await db()
    .update(jobs)
    .set({ done: sql`${jobs.done} + 1`, updatedAt: new Date() })
    .where(eq(jobs.id, id));
}

/** One active job per repository. Old unfinished rows are treated as abandoned. */
export async function findActiveJob(owner: string, name: string): Promise<JobRow | undefined> {
  const [row] = await db()
    .select()
    .from(jobs)
    .where(
      and(
        sql`lower(${jobs.owner}) = ${owner.toLowerCase()}`,
        sql`lower(${jobs.name}) = ${name.toLowerCase()}`,
        inArray(jobs.status, ["queued", "running"]),
        gt(jobs.updatedAt, new Date(Date.now() - STALE_MS)),
      ),
    )
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  return row;
}

export async function countRecentJobs(userId: string, windowMs: number) {
  const since = new Date(Date.now() - windowMs);
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), gt(jobs.createdAt, since)));
  return r?.n ?? 0;
}

export function toView(job: JobRow): JobView {
  return {
    status: job.status,
    step: job.step,
    progress: { done: job.done, total: job.total },
    repo: `${job.owner}/${job.name}`,
    wikiPath: job.status === "done" ? `/wiki/${job.owner}/${job.name}` : undefined,
    error: job.errorMessage ?? undefined,
    errorCode: job.errorCode ?? undefined,
  };
}
