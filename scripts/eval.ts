/* Usage: bun run eval owner/repo [maxPages]. Needs GOOGLE_API_KEY (and GITHUB_TOKEN to avoid rate limits). */
import { fetchSnapshot } from "../src/lib/snapshot";
import { planOutline } from "../src/lib/pipeline/plan";
import { writePage } from "../src/lib/pipeline/write";
import { PROMPT_VERSION } from "../src/lib/pipeline/types";

const [slug, max = "4"] = process.argv.slice(2);
const [owner, name] = (slug ?? "").split("/");
if (!owner || !name) throw new Error("usage: bun run eval owner/repo [maxPages]");

const snap = await fetchSnapshot({ user: owner, repo: name });
const files = Object.fromEntries(snap.files.map((f) => [f.path, f.content]));
const tree = Object.keys(files).sort();
const readmePath = tree.find((f) => /^readme(\.[a-z]+)?$/i.test(f));
const ctx = {
  owner, name, sha: snap.sha, description: snap.description, tree,
  readme: readmePath ? files[readmePath].slice(0, 12_000) : "",
  manifests: Object.fromEntries(tree.filter((f) => /^(package\.json|pyproject\.toml|go\.mod|Cargo\.toml)$/.test(f)).map((f) => [f, files[f].slice(0, 6000)])),
};

const plan = await planOutline(ctx);
const rows = [];
for (const page of plan.outline.slice(0, Number(max))) {
  const t0 = Date.now();
  const res = await writePage({
    ctx, page, outline: plan.outline,
    files: Object.fromEntries(page.files.map((f) => [f, files[f]])),
  });
  rows.push({
    page: page.slug,
    chars: res.markdown.length,
    citations: res.stats.citations,
    broken: res.stats.brokenCitations + res.stats.brokenLinks,
    mermaid: res.stats.mermaidBlocks,
    droppedMermaid: res.stats.droppedMermaid,
    tokens: res.tokensIn + res.tokensOut,
    secs: Math.round((Date.now() - t0) / 1000),
  });
}
console.log(`prompt ${PROMPT_VERSION} | ${owner}/${name}@${snap.sha.slice(0, 7)} | ${plan.outline.length} pages planned`);
console.table(rows);
