import { eq } from "drizzle-orm";
import { db } from "@/db";
import { generations, repos } from "@/db/schema";
import { logger } from "./logger";
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
  // Job state is only revealed to the user who started it, so other users can't probe repos.
  const mine = active?.userId === userId ? active : undefined;
  const base: RepoStatus = {
    documented: false, visibility: null, docSha: null, headSha: null, stale: false, behindBy: 0, commits: [],
    generatedAt: null, syncing: !!mine, activeJobId: mine?.id ?? null,
  };
  if (!repo?.currentGenerationId || repo.ownerUserId !== userId) return base;

  const [gen] = await db().select().from(generations).where(eq(generations.id, repo.currentGenerationId));
  if (!gen) return base;
  const out: RepoStatus = { ...base, documented: true, visibility: repo.visibility, docSha: gen.commitSha, generatedAt: gen.finishedAt?.toISOString() ?? null };

  const key = `${userId}:${repo.id}:${gen.commitSha}`;
  let head = cache().get(key);
  if (!head || Date.now() - head.at > TTL_MS) {
    try {
      const token = await getUserGithubToken(userId);
      const ref = { user: repo.owner, repo: repo.name };
      const info = await fetchRepoInfo(ref, token);
      const visibility = info.private ? "private" : "public";
      if (visibility !== repo.visibility) {
        await db().update(repos).set({ visibility }).where(eq(repos.id, repo.id));
        out.visibility = visibility;
      }
      const headSha = await getHeadSha(ref, info.defaultBranch, token);
      const cmp = headSha === gen.commitSha ? { aheadBy: 0, commits: [] } : await compareCommits(ref, gen.commitSha, headSha, token);
      head = { at: Date.now(), value: { headSha, behindBy: cmp.aheadBy, commits: cmp.commits } };
      cache().set(key, head);
    } catch (e) {
      // GitHub trouble must not hide the wiki the owner already has; report it without head data.
      logger.warn({ err: e, owner, name }, "repo status lookup failed");
      return out;
    }
  }
  return { ...out, ...head.value, stale: head.value.headSha !== gen.commitSha };
}
