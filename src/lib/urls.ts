import type { RepoRef } from "./repo-url";

/** Single place that builds GitHub web URLs (permalinks, commits, repo home). */
const WEB = "https://github.com";

export const repoUrl = ({ user, repo }: RepoRef) => `${WEB}/${user}/${repo}`;
export const commitUrl = (ref: RepoRef, sha: string) => `${repoUrl(ref)}/commit/${sha}`;

export function blobUrl(ref: RepoRef, sha: string, path: string, lines?: { start: number; end?: number }) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const anchor = lines ? `#L${lines.start}${lines.end && lines.end !== lines.start ? `-L${lines.end}` : ""}` : "";
  return `${repoUrl(ref)}/blob/${sha}/${encoded}${anchor}`;
}

export function refFromFullName(fullName: string): RepoRef {
  const [user, repo] = fullName.split("/");
  return { user, repo };
}
