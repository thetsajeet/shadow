import { promises as fs } from "node:fs";
import path from "node:path";
import { SAFE_SEGMENT } from "./github";

export interface WikiPageMeta {
  slug: string;
  title: string;
  summary: string;
}

export interface WikiMeta {
  repo: string;
  branch: string;
  sha: string;
  generatedAt: string;
  pages: WikiPageMeta[];
}

const ROOT = path.join(process.cwd(), "data", "wiki");

function safe(...segments: string[]) {
  for (const s of segments) {
    if (!SAFE_SEGMENT.test(s) || s === "." || s === "..") {
      throw new Error("Invalid path segment");
    }
  }
}

export function wikiDir(user: string, repo: string) {
  safe(user, repo);
  return path.join(ROOT, user, repo);
}

export async function writeWiki(
  user: string,
  repo: string,
  meta: WikiMeta,
  pages: Record<string, string>,
) {
  const dir = wikiDir(user, repo);
  const tmp = `${dir}.tmp-${Date.now()}`;
  await fs.mkdir(path.join(tmp, "pages"), { recursive: true });
  for (const [slug, md] of Object.entries(pages)) {
    safe(slug);
    await fs.writeFile(path.join(tmp, "pages", `${slug}.md`), md, "utf8");
  }
  await fs.writeFile(path.join(tmp, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rename(tmp, dir);
}

export async function readMeta(user: string, repo: string): Promise<WikiMeta | null> {
  try {
    const raw = await fs.readFile(path.join(wikiDir(user, repo), "meta.json"), "utf8");
    return JSON.parse(raw) as WikiMeta;
  } catch {
    return null;
  }
}

export async function readPage(user: string, repo: string, slug: string): Promise<string | null> {
  try {
    safe(slug);
    return await fs.readFile(path.join(wikiDir(user, repo), "pages", `${slug}.md`), "utf8");
  } catch {
    return null;
  }
}
