import { randomUUID } from "node:crypto";

export type JobStatus = "queued" | "running" | "done" | "error";

export interface Job {
  id: string;
  status: JobStatus;
  step: string;
  progress: { done: number; total: number };
  repo: string;
  wikiPath?: string;
  error?: string;
  createdAt: number;
}

interface JobStore {
  jobs: Map<string, Job>;
  currentRepo: string | null;
}

const g = globalThis as unknown as { __shadowJobs?: JobStore };
const store: JobStore = (g.__shadowJobs ??= { jobs: new Map(), currentRepo: null });

export function currentRepo() {
  return store.currentRepo;
}

export function getJob(id: string) {
  return store.jobs.get(id);
}

export function updateJob(id: string, patch: Partial<Job>) {
  const job = store.jobs.get(id);
  if (job) Object.assign(job, patch);
}

/** Returns null when the global lock is already held. */
export function tryCreateJob(repo: string): Job | null {
  if (store.currentRepo) return null;
  store.currentRepo = repo;
  const job: Job = {
    id: randomUUID(),
    status: "queued",
    step: "Queued",
    progress: { done: 0, total: 0 },
    repo,
    createdAt: Date.now(),
  };
  store.jobs.set(job.id, job);
  // keep memory bounded
  if (store.jobs.size > 50) {
    const oldest = [...store.jobs.keys()][0];
    store.jobs.delete(oldest);
  }
  return job;
}

export function releaseLock(repo: string) {
  if (store.currentRepo === repo) store.currentRepo = null;
}

/** Runs fn while the lock is held; always releases it in finally. */
export async function runJob(job: Job, fn: () => Promise<string>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    updateJob(job.id, { status: "running", step: "Starting" });
    const wikiPath = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Job timed out")), timeoutMs);
      }),
    ]);
    updateJob(job.id, { status: "done", step: "Done", wikiPath });
  } catch (e) {
    updateJob(job.id, {
      status: "error",
      error: e instanceof Error ? e.message : "Unknown error",
    });
  } finally {
    if (timer) clearTimeout(timer);
    releaseLock(job.repo);
  }
}
