import { Octokit } from "octokit";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { env } from "@/env";
import { ShadowError } from "./errors";
import type { RepoRef } from "./repo-url";

export { SAFE_SEGMENT, parseRepoUrl, type RepoRef } from "./repo-url";

// Don't hold a serverless function open waiting out long GitHub rate-limit windows.
const MAX_RETRY_WAIT_S = 30;

const ThrottledOctokit = Octokit.plugin(throttling, retry);

const g = globalThis as unknown as { __shadowOctokit?: InstanceType<typeof ThrottledOctokit> };

function build(auth: string) {
  return new ThrottledOctokit({
    auth,
    userAgent: "shadow-wiki",
    request: { timeout: 30_000 },
    throttle: {
      onRateLimit: (retryAfter, _options, _octo, retryCount) => retryCount < 2 && retryAfter <= MAX_RETRY_WAIT_S,
      onSecondaryRateLimit: (retryAfter, _options, _octo, retryCount) => retryCount < 2 && retryAfter <= MAX_RETRY_WAIT_S,
    },
  });
}

/** Client for a user's own token (private repos, /user endpoints) or the server token for public reads. */
export function octokit(userToken?: string) {
  if (userToken) return build(userToken);
  g.__shadowOctokit ??= build(env().GITHUB_TOKEN);
  return g.__shadowOctokit;
}

export interface RepoInfo {
  owner: string;
  name: string;
  defaultBranch: string;
  description: string | null;
  sizeKb: number;
  private: boolean;
}

function status(e: unknown): number | undefined {
  return typeof e === "object" && e && "status" in e ? Number((e as { status: unknown }).status) : undefined;
}

export function mapError(e: unknown, what: string): ShadowError {
  const s = status(e);
  if (s === 404) return new ShadowError("NOT_FOUND", "Repository not found, or your GitHub account cannot access it.");
  if (s === 403 || s === 429) return new ShadowError("RATE_LIMITED", "GitHub API rate limit reached. Please try again later.", true);
  if (s && s >= 500) return new ShadowError("INGEST_FAILED", `GitHub is unavailable (${s}) while ${what}.`, true);
  return new ShadowError("INGEST_FAILED", `GitHub error while ${what}: ${e instanceof Error ? e.message : "unknown"}`);
}

export async function fetchRepoInfo({ user, repo }: RepoRef, userToken?: string): Promise<RepoInfo> {
  try {
    const { data } = await octokit(userToken).rest.repos.get({ owner: user, repo });
    if (!data.default_branch) throw new ShadowError("INGEST_FAILED", "Could not determine the default branch.");
    return { owner: data.owner.login, name: data.name, defaultBranch: data.default_branch, description: data.description, sizeKb: data.size, private: data.private };
  } catch (e) {
    throw e instanceof ShadowError ? e : mapError(e, "reading repository");
  }
}

export async function getHeadSha({ user, repo }: RepoRef, branch: string, userToken?: string): Promise<string> {
  try {
    const { data } = await octokit(userToken).rest.repos.getBranch({ owner: user, repo, branch });
    return data.commit.sha;
  } catch (e) {
    throw mapError(e, "resolving the branch head");
  }
}

export async function downloadTarball({ user, repo }: RepoRef, sha: string, userToken?: string): Promise<Uint8Array> {
  try {
    const res = await octokit(userToken).rest.repos.downloadTarballArchive({ owner: user, repo, ref: sha });
    return new Uint8Array(res.data as ArrayBuffer);
  } catch (e) {
    throw mapError(e, "downloading source");
  }
}

export interface CommitComparison {
  aheadBy: number;
  commits: { sha: string; message: string; author: string | null; date: string | null }[];
}

/** Commits on `head` that are not in `base`; used only to describe how far behind a wiki is. */
export async function compareCommits({ user, repo }: RepoRef, base: string, head: string, userToken?: string): Promise<CommitComparison> {
  try {
    const { data } = await octokit(userToken).rest.repos.compareCommitsWithBasehead({ owner: user, repo, basehead: `${base}...${head}`, per_page: 10 });
    return {
      aheadBy: data.ahead_by,
      commits: data.commits.slice(-10).reverse().map((c) => ({
        sha: c.sha,
        message: c.commit.message.split("\n")[0],
        author: c.author?.login ?? c.commit.author?.name ?? null,
        date: c.commit.author?.date ?? null,
      })),
    };
  } catch (e) {
    throw mapError(e, "comparing commits");
  }
}
