import { ShadowError } from "./errors";

export const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export interface RepoRef {
  user: string;
  repo: string;
}

export function parseRepoUrl(input: string): RepoRef {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ShadowError("INVALID_URL", "Invalid URL. Expected https://github.com/<user>/<repo>");
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new ShadowError("INVALID_URL", "Invalid URL. Expected https://github.com/<user>/<repo>");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || (parts.length > 2 && parts[2] !== "tree")) {
    throw new ShadowError("INVALID_URL", "Invalid URL. Expected https://github.com/<user>/<repo>");
  }
  const user = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  if (!SAFE_SEGMENT.test(user) || !SAFE_SEGMENT.test(repo) || repo === "." || repo === ".." || user === "." || user === "..") {
    throw new ShadowError("INVALID_URL", "Invalid repository name.");
  }
  return { user, repo };
}
