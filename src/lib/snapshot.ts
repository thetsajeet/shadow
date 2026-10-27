import { createHash } from "node:crypto";
import { parseTarGzip } from "nanotar";
import { ShadowError } from "./errors";
import { downloadTarball, fetchRepoInfo, getHeadSha } from "./github";
import type { RepoRef } from "./repo-url";

export const MAX_FILES = 500;
export const MAX_FILE_BYTES = 200 * 1024;
const MAX_TARBALL_KB = 150 * 1024;
const MAX_RAW_ENTRIES = 50_000;

const IGNORED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", "target",
  "vendor", "coverage", "__pycache__", ".venv", "venv", ".idea", ".vscode", ".gradle", "bin", "obj",
]);
const IGNORED_NAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb", "Cargo.lock",
  "poetry.lock", "Pipfile.lock", "go.sum", "composer.lock", "Gemfile.lock", ".DS_Store",
]);
const BINARY_EXT = [
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".bmp", ".pdf", ".zip", ".tar", ".gz",
  ".tgz", ".7z", ".rar", ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp3", ".mp4", ".mov", ".webm",
  ".wav", ".exe", ".dll", ".so", ".dylib", ".class", ".jar", ".wasm", ".bin", ".pyc", ".o", ".a",
  ".min.js", ".map", ".psd", ".ai",
];

const LANGS: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  py: "python", go: "go", rs: "rust", java: "java", kt: "kotlin", rb: "ruby", php: "php", cs: "csharp",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", swift: "swift", sh: "bash", md: "markdown", json: "json",
  yml: "yaml", yaml: "yaml", toml: "toml", sql: "sql", html: "html", css: "css", scss: "scss", vue: "vue",
};

export interface SnapshotFile {
  path: string;
  content: string;
  size: number;
  blobSha: string;
  language: string | null;
}

export interface Snapshot {
  owner: string;
  name: string;
  branch: string;
  sha: string;
  description: string | null;
  files: SnapshotFile[];
}

export function languageOf(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGS[ext] ?? null;
}

/** Git blob object hash, used for cross-generation caching. */
export function gitBlobSha(buf: Uint8Array): string {
  return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
}

export function keepPath(path: string, size: number): boolean {
  const parts = path.split("/");
  const name = parts[parts.length - 1];
  if (parts.slice(0, -1).some((d) => IGNORED_DIRS.has(d))) return false;
  if (IGNORED_NAMES.has(name)) return false;
  const lower = name.toLowerCase();
  if (BINARY_EXT.some((x) => lower.endsWith(x))) return false;
  return size > 0 && size <= MAX_FILE_BYTES;
}

function isBinary(buf: Uint8Array) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

export async function fetchSnapshot(ref: RepoRef): Promise<Snapshot> {
  const info = await fetchRepoInfo(ref);
  if (info.sizeKb > MAX_TARBALL_KB) {
    throw new ShadowError("TOO_LARGE", "Repository is too large to process.");
  }
  const sha = await getHeadSha(ref, info.defaultBranch);
  const tarball = await downloadTarball(ref, sha);

  let seen = 0;
  const files: SnapshotFile[] = [];
  try {
    await parseTarGzip(tarball, {
      filter: (item) => {
        if (++seen > MAX_RAW_ENTRIES) throw new ShadowError("TOO_LARGE", "Repository has too many entries.");
        if (item.type !== "file") return false;
        const path = item.name.split("/").slice(1).join("/");
        return path.length > 0 && !path.includes("..") && keepPath(path, item.size);
      },
    }).then((items) => {
      for (const item of items) {
        if (!item.data || isBinary(item.data)) continue;
        const path = item.name.split("/").slice(1).join("/");
        files.push({
          path,
          content: new TextDecoder().decode(item.data),
          size: item.size,
          blobSha: gitBlobSha(item.data),
          language: languageOf(path),
        });
        if (files.length > MAX_FILES) {
          throw new ShadowError("TOO_LARGE", `Repository is too large (more than ${MAX_FILES} files after filtering).`);
        }
      }
    });
  } catch (e) {
    if (e instanceof ShadowError) throw e;
    throw new ShadowError("INGEST_FAILED", "Failed to read the repository archive.");
  }
  if (files.length === 0) throw new ShadowError("INGEST_FAILED", "No readable source files found in this repository.");
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { owner: info.owner, name: info.name, branch: info.defaultBranch, sha, description: info.description, files };
}
