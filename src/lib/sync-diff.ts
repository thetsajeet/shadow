export interface FileSig {
  path: string;
  blobSha: string;
}

export interface PrevPage {
  slug: string;
  sourceFiles: string[];
  markdown: string | null;
  status: "pending" | "done" | "error";
}

export interface FileDiff {
  added: string[];
  modified: string[];
  removed: string[];
}

/** Net change between two snapshots, keyed on git blob SHAs (no per-commit processing). */
export function diffFiles(prev: FileSig[], next: FileSig[]): FileDiff {
  const before = new Map(prev.map((f) => [f.path, f.blobSha]));
  const after = new Map(next.map((f) => [f.path, f.blobSha]));
  const added: string[] = [];
  const modified: string[] = [];
  for (const [path, sha] of after) {
    const old = before.get(path);
    if (old === undefined) added.push(path);
    else if (old !== sha) modified.push(path);
  }
  const removed = [...before.keys()].filter((p) => !after.has(p));
  return { added: added.sort(), modified: modified.sort(), removed: removed.sort() };
}

const REPLAN_RATIO = 0.3;

/** A large or structural change invalidates the old outline, so the whole wiki is planned again. */
export function shouldReplan(diff: FileDiff, prev: FileSig[]): boolean {
  const changed = diff.added.length + diff.modified.length + diff.removed.length;
  if (prev.length === 0) return true;
  if (changed / prev.length > REPLAN_RATIO) return true;
  const topDirs = (paths: string[]) => new Set(paths.filter((p) => p.includes("/")).map((p) => p.split("/")[0]));
  const known = topDirs(prev.map((f) => f.path));
  return [...topDirs(diff.added)].some((d) => !known.has(d));
}

export interface ReusePlan {
  /** Pages carried forward unchanged (markdown re-pinned to the new SHA). */
  keep: (PrevPage & { markdown: string })[];
  /** Pages whose source files changed, or that never finished, and must be rewritten. */
  rewrite: PrevPage[];
}

export function planReuse(pages: PrevPage[], diff: FileDiff): ReusePlan {
  const touched = new Set([...diff.modified, ...diff.removed]);
  const keep: ReusePlan["keep"] = [];
  const rewrite: PrevPage[] = [];
  for (const p of pages) {
    if (p.status === "done" && p.markdown !== null && !p.sourceFiles.some((f) => touched.has(f))) {
      keep.push({ ...p, markdown: p.markdown });
    } else rewrite.push(p);
  }
  return { keep, rewrite };
}

/** Source links are pinned to a commit, so carried-forward pages must point at the new one. */
export function repinLinks(markdown: string, owner: string, name: string, oldSha: string, newSha: string): string {
  const prefix = `https://github.com/${owner}/${name}/blob/`;
  return markdown.split(`${prefix}${oldSha}/`).join(`${prefix}${newSha}/`);
}
