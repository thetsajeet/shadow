import { createHash } from "node:crypto";
import { parseTarGzip } from "nanotar";
import { ShadowError } from "./errors";
import { downloadTarball, fetchRepoInfo, getHeadSha } from "./github";
import type { RepoRef } from "./repo-url";

export const MAX_FILES = 500;
export const MAX_FILE_BYTES = 200 * 1024;
const MAX_TARBALL_KB = 150 * 1024;
const MAX_TARBALL_BYTES = 100 * 1024 * 1024;
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
  ".pem", ".key", ".p12", ".pfx", ".keystore",
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
  private: boolean;
  license: string | null;
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

export function redactSecrets(content: string, path: string): string {
  const basename = path.split("/").at(-1)?.toLowerCase() ?? "";
  const envFile = basename === ".env" || basename.startsWith(".env.");
  const envExample = /\.(?:example|sample|template)$/.test(basename);
  if (envFile && !envExample) {
    return content.replace(/^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*).+$/gm, "$1[REDACTED]");
  }
  return content
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,})\b/g, "[REDACTED]")
    .replace(
      /((?:api[_-]?key|access[_-]?token|token|secret|password|passwd|client[_-]?secret|private[_-]?key|credential)["']?\s*[:=]\s*["'])([^"'\r\n]+)(["'])/gi,
      (match, prefix: string, value: string, suffix: string) => /^(?:replace[-_ ]?me|your[-_ ]|example|sample|changeme|placeholder|<[^>]+>|\$\{)/i.test(value) ? match : `${prefix}[REDACTED]${suffix}`,
    );
}

function snapshotPath(name: string): string | null {
  if (name.startsWith("/") || name.includes("\\") || name.includes("\0")) return null;
  const parts = name.split("/");
  if (parts.length < 2) return null;
  const path = parts.slice(1).join("/");
  const segments = path.split("/");
  if (!path || segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return path;
}

function isBinary(buf: Uint8Array) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

export async function fetchSnapshot(ref: RepoRef, userToken?: string): Promise<Snapshot> {
  const info = await fetchRepoInfo(ref, userToken);
  if (info.sizeKb > MAX_TARBALL_KB) {
    throw new ShadowError("TOO_LARGE", "Repository is too large to process.");
  }
  const sha = await getHeadSha(ref, info.defaultBranch, userToken);
  const tarball = await downloadTarball(ref, sha, userToken);
  if (tarball.byteLength > MAX_TARBALL_BYTES) {
    throw new ShadowError("TOO_LARGE", "Repository archive exceeds the download size limit.");
  }

  let seen = 0;
  const files: SnapshotFile[] = [];
  const paths = new Set<string>();
  try {
    await parseTarGzip(tarball, {
      filter: (item) => {
        if (++seen > MAX_RAW_ENTRIES) throw new ShadowError("TOO_LARGE", "Repository has too many entries.");
        if (item.type !== "file") return false;
        const path = snapshotPath(item.name);
        return path !== null && keepPath(path, item.size);
      },
    }).then((items) => {
      for (const item of items) {
        if (!item.data || isBinary(item.data)) continue;
        const path = snapshotPath(item.name);
        if (!path || paths.has(path)) continue;
        paths.add(path);
        const rawContent = new TextDecoder().decode(item.data);
        const content = redactSecrets(rawContent, path);
        files.push({
          path,
          content,
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
  return { owner: info.owner, name: info.name, branch: info.defaultBranch, sha, description: info.description, private: info.private, license: info.license, files };
}
