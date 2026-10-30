import { Octokit } from "octokit";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { env } from "@/env";
import { ShadowError } from "./errors";
import type { RepoRef } from "./repo-url";

export { SAFE_SEGMENT, parseRepoUrl, type RepoRef } from "./repo-url";

// Don't hold a serverless function open waiting out long GitHub rate-limit windows.
const MAX_RETRY_WAIT_S = 30;
const MAX_TARBALL_BYTES = 100 * 1024 * 1024;

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
  license: string | null;
}

function status(e: unknown): number | undefined {
  return typeof e === "object" && e && "status" in e ? Number((e as { status: unknown }).status) : undefined;
}

export function mapError(e: unknown, what: string): ShadowError {
  const s = status(e);
  if (s === 401) return new ShadowError("UNAUTHENTICATED", "Your GitHub authorization expired. Please sign in again.");
  if (s === 404) return new ShadowError("NOT_FOUND", "Repository not found, or your GitHub account cannot access it.");
  if (s === 403 || s === 429) return new ShadowError("RATE_LIMITED", "GitHub API rate limit reached. Please try again later.", true);
  if (s && s >= 500) return new ShadowError("INGEST_FAILED", `GitHub is unavailable (${s}) while ${what}.`, true);
  return new ShadowError("INGEST_FAILED", `GitHub error while ${what}: ${e instanceof Error ? e.message : "unknown"}`);
}

export async function readBoundedStream(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ShadowError("TOO_LARGE", "Repository archive exceeds the download size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function fetchRepoInfo({ user, repo }: RepoRef, userToken?: string): Promise<RepoInfo> {
  try {
    const { data } = await octokit(userToken).rest.repos.get({ owner: user, repo });
    if (!data.default_branch) throw new ShadowError("INGEST_FAILED", "Could not determine the default branch.");
    return {
      owner: data.owner.login,
      name: data.name,
      defaultBranch: data.default_branch,
      description: data.description,
      sizeKb: data.size,
      private: data.private,
      license: data.license?.spdx_id ?? null,
    };
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
    const config = env();
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}/tarball/${encodeURIComponent(sha)}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${userToken ?? config.GITHUB_TOKEN}`,
          "x-github-api-version": "2022-11-28",
          "user-agent": "shadow-wiki",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) throw Object.assign(new Error(`GitHub returned ${response.status}`), { status: response.status });
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_TARBALL_BYTES) {
      await response.body?.cancel();
      throw new ShadowError("TOO_LARGE", "Repository archive exceeds the download size limit.");
    }
    if (!response.body) throw new ShadowError("INGEST_FAILED", "GitHub returned an empty repository archive.");
    return await readBoundedStream(response.body, MAX_TARBALL_BYTES);
  } catch (e) {
    if (e instanceof ShadowError) throw e;
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
