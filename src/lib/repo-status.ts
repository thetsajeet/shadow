import { eq } from "drizzle-orm";
import { db } from "@/db";
import { generations } from "@/db/schema";
import { compareCommits, getHeadSha, fetchRepoInfo, type CommitComparison } from "./github";
import { findActiveJob } from "./jobs";
import { getUserGithubToken } from "./user-token";
import { findRepo } from "./wiki-store";

export interface RepoStatus {
  documented: boolean;
  visibility: "public" | "private" | null;
  docSha: string | null;
  headSha: string | null;
  stale: boolean;
  behindBy: number;
  commits: CommitComparison["commits"];
  generatedAt: string | null;
  syncing: boolean;
  activeJobId: string | null;
}

const TTL_MS = 2 * 60_000;
const g = globalThis as unknown as { __shadowHeadCache?: Map<string, { at: number; value: Pick<RepoStatus, "headSha" | "behindBy" | "commits"> }> };
const cache = () => (g.__shadowHeadCache ??= new Map());

/** Compares the stored wiki commit with the branch head. Never mutates anything: syncing is always user-initiated. */
export async function getRepoStatus(userId: string, owner: string, name: string): Promise<RepoStatus> {
  const repo = await findRepo(owner, name);
  const active = await findActiveJob(owner, name);
  const base: RepoStatus = {
    documented: false, visibility: null, docSha: null, headSha: null, stale: false, behindBy: 0, commits: [],
    generatedAt: null, syncing: !!active, activeJobId: active?.id ?? null,
  };
  if (!repo?.currentGenerationId || repo.ownerUserId !== userId) return base;

  const [gen] = await db().select().from(generations).where(eq(generations.id, repo.currentGenerationId));
  if (!gen) return base;
  const out: RepoStatus = { ...base, documented: true, visibility: repo.visibility, docSha: gen.commitSha, generatedAt: gen.finishedAt?.toISOString() ?? null };

  const key = `${userId}:${repo.id}:${gen.commitSha}`;
  let head = cache().get(key);
  if (!head || Date.now() - head.at > TTL_MS) {
    const token = await getUserGithubToken(userId);
    const ref = { user: repo.owner, repo: repo.name };
    const info = await fetchRepoInfo(ref, token);
    const headSha = await getHeadSha(ref, info.defaultBranch, token);
    const cmp = headSha === gen.commitSha ? { aheadBy: 0, commits: [] } : await compareCommits(ref, gen.commitSha, headSha, token);
    head = { at: Date.now(), value: { headSha, behindBy: cmp.aheadBy, commits: cmp.commits } };
    cache().set(key, head);
  }
  return { ...out, ...head.value, stale: head.value.headSha !== gen.commitSha };
}
