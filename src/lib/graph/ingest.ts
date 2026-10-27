import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cloneRepo, fetchRepoInfo, ShadowError } from "../github";
import { updateJob } from "../jobs";
import type { GraphStateType } from "./state";

export const workDirFor = (jobId: string) => path.join(os.tmpdir(), `shadow-${jobId}`);

export const MAX_FILES = 500;
const MAX_FILE_BYTES = 200 * 1024;

const IGNORED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", "target",
  "vendor", "coverage", "__pycache__", ".venv", "venv", ".idea", ".vscode", ".gradle", "bin", "obj",
]);
const IGNORED_NAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb", "Cargo.lock",
  "poetry.lock", "Pipfile.lock", "go.sum", "composer.lock", "Gemfile.lock", ".DS_Store",
]);
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".bmp", ".pdf", ".zip", ".tar", ".gz",
  ".tgz", ".7z", ".rar", ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp3", ".mp4", ".mov", ".webm",
  ".wav", ".exe", ".dll", ".so", ".dylib", ".class", ".jar", ".wasm", ".bin", ".pyc", ".o", ".a",
  ".min.js", ".map", ".psd", ".ai",
]);
const MANIFESTS = [
  "package.json", "pyproject.toml", "go.mod", "Cargo.toml", "requirements.txt", "pom.xml",
  "build.gradle", "Gemfile", "composer.json", "setup.py", "Dockerfile", "docker-compose.yml",
];

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      await walk(root, full, out);
    } else if (e.isFile()) {
      if (IGNORED_NAMES.has(e.name)) continue;
      const lower = e.name.toLowerCase();
      if ([...BINARY_EXT].some((x) => lower.endsWith(x))) continue;
      const st = await fs.stat(full);
      if (st.size > MAX_FILE_BYTES || st.size === 0) continue;
      out.push(path.relative(root, full).split(path.sep).join("/"));
      if (out.length > MAX_FILES) return;
    }
  }
}

async function tryRead(p: string, max = 12_000) {
  try {
    return (await fs.readFile(p, "utf8")).slice(0, max);
  } catch {
    return "";
  }
}

export async function ingest(state: GraphStateType): Promise<Partial<GraphStateType>> {
  updateJob(state.jobId, { step: "Checking repository" });
  const info = await fetchRepoInfo(state.repo);

  updateJob(state.jobId, { step: `Cloning ${info.defaultBranch}` });
  const workdir = workDirFor(state.jobId);
  await fs.mkdir(workdir, { recursive: true });
  const clonePath = path.join(workdir, "repo");
  try {
    const sha = await cloneRepo(state.repo, info.defaultBranch, clonePath);

    updateJob(state.jobId, { step: "Scanning files" });
    const tree: string[] = [];
    await walk(clonePath, clonePath, tree);
    if (tree.length > MAX_FILES) {
      throw new ShadowError(`Repository is too large (more than ${MAX_FILES} files after filtering).`);
    }
    if (tree.length === 0) throw new ShadowError("No readable source files found in this repository.");
    tree.sort();

    const readmePath = tree.find((f) => /^readme(\.[a-z]+)?$/i.test(f));
    const readme = readmePath ? await tryRead(path.join(clonePath, readmePath)) : "";
    const manifests: Record<string, string> = {};
    for (const f of tree) {
      if (MANIFESTS.includes(path.posix.basename(f)) && f.split("/").length <= 2) {
        manifests[f] = await tryRead(path.join(clonePath, f), 6_000);
      }
    }
    return { branch: info.defaultBranch, sha, workdir, tree, readme, manifests };
  } catch (e) {
    await fs.rm(workdir, { recursive: true, force: true });
    throw e;
  }
}
