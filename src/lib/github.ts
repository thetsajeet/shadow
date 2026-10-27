import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import { ShadowError, type RepoRef } from "./repo-url";

export { SAFE_SEGMENT, ShadowError, parseRepoUrl, type RepoRef } from "./repo-url";

export interface RepoInfo {
  defaultBranch: string;
  private: boolean;
}

export async function fetchRepoInfo({ user, repo }: RepoRef): Promise<RepoInfo> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "shadow-wiki",
  };
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${user}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ShadowError("Could not reach the GitHub API. Please try again.");
  }
  if (res.status === 404) {
    throw new ShadowError("Repository not found, or it is private. Shadow only supports public repos.");
  }
  if (res.status === 403 || res.status === 429) {
    throw new ShadowError("GitHub API rate limit reached. Please try again later.");
  }
  if (!res.ok) {
    throw new ShadowError(`GitHub API error (${res.status}).`);
  }
  const data = (await res.json()) as { default_branch?: string; private?: boolean };
  if (data.private) {
    throw new ShadowError("Private repositories are not supported.");
  }
  if (!data.default_branch) {
    throw new ShadowError("Could not determine the default branch.");
  }
  return { defaultBranch: data.default_branch, private: false };
}

export async function cloneRepo(ref: RepoRef, branch: string, dest: string): Promise<string> {
  try {
    await execFileAsync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--single-branch",
        "--branch",
        branch,
        `https://github.com/${ref.user}/${ref.repo}.git`,
        dest,
      ],
      { timeout: 120_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
    );
    const { stdout } = await execFileAsync("git", ["-C", dest, "rev-parse", "HEAD"]);
    return stdout.trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : "unknown error";
    throw new ShadowError(`Failed to clone repository: ${msg}`);
  }
}

export function sourceUrl(ref: RepoRef, sha: string, path: string): string {
  return `https://github.com/${ref.user}/${ref.repo}/blob/${sha}/${path}`;
}
