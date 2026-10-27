import { analyzeRepo, formatAnalysis } from "./analyze";
import { llmError, makeLlm, withRetry } from "./llm";
import { OutlineSchema, planModel, type OutlinePage, type RepoContext } from "./types";

const MAX_PROMPT_CHARS = 60_000;
const MAX_PAGES = 14;

export function normalizeOutline(raw: OutlinePage[], tree: string[]): OutlinePage[] {
  const known = new Set(tree);
  const seen = new Set<string>();
  const out: OutlinePage[] = [];
  for (const p of raw.slice(0, MAX_PAGES)) {
    let slug = p.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "page";
    while (seen.has(slug)) slug += "-2";
    seen.add(slug);
    out.push({ ...p, slug, files: [...new Set(p.files.filter((f) => known.has(f)))] });
  }
  return out;
}

export async function planOutline(ctx: RepoContext): Promise<{ outline: OutlinePage[]; tokensIn: number; tokensOut: number }> {
  const manifests = Object.entries(ctx.manifests)
    .map(([f, c]) => `### ${f}\n${c}`)
    .join("\n\n");
  let tree = ctx.tree.join("\n");
  if (tree.length > 25_000) tree = tree.slice(0, 25_000) + "\n…(truncated)";
  const prompt = `You are planning a wiki-style documentation site for the GitHub repository ${ctx.owner}/${ctx.name}.
${ctx.description ? `Description: ${ctx.description}\n` : ""}
Produce an outline of 6 to 14 pages (fewer for tiny repos), ordered from high level to detailed. Cover, where the repo actually supports them:
1. Overview (slug "overview"): purpose, audience, key features, tech stack, repo layout.
2. Architecture: components, how they fit together, design decisions.
3. Getting started & development: install, build, run, test, project scripts.
4. Configuration & environment: env vars, config files, deployment/CI if present.
5. One page per major module/subsystem/feature (core logic, public API, data models, CLI, UI, etc.).
6. Data flow / request lifecycle, if the system has one.
7. Testing, and extension/contribution points, if relevant.
Do not invent pages the code does not support. Slugs must be lowercase kebab-case. For each page give a summary stating exactly what it should explain, and list 1 to 8 repo-relative file paths (exact paths from the file tree below) the author must read; prefer entry points and files central to the topic.

## Automated analysis
${formatAnalysis(analyzeRepo(ctx))}

## File tree
${tree}

## Manifests
${manifests || "(none)"}

## README
${ctx.readme || "(none)"}`.slice(0, MAX_PROMPT_CHARS);

  try {
    const llm = makeLlm(planModel(), 0.2).withStructuredOutput(OutlineSchema, { includeRaw: true });
    const res = await withRetry(() => llm.invoke(prompt));
    const usage = (res.raw as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata;
    return {
      outline: normalizeOutline(res.parsed.pages, ctx.tree),
      tokensIn: usage?.input_tokens ?? 0,
      tokensOut: usage?.output_tokens ?? 0,
    };
  } catch (e) {
    throw llmError(e);
  }
}
