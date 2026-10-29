import { analyzeRepo, formatAnalysis } from "./analyze";
import { llmError, makeLlm, traceLlmCall, withRetry } from "./llm";
import { OutlineSchema, planModel, type OutlinePage, type RepoContext } from "./types";

const MAX_PROMPT_CHARS = 60_000;
const MAX_PAGES = 14;

export function normalizeOutline(raw: OutlinePage[], tree: string[]): OutlinePage[] {
  const known = new Set(tree);
  const seen = new Set<string>();
  const out: OutlinePage[] = [];
  for (const p of raw.slice(0, MAX_PAGES)) {
    let slug = p.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "page";
    if (slug === "chat") slug = "chat-docs"; // /chat is the Q&A route
    while (seen.has(slug)) slug += "-2";
    seen.add(slug);
    out.push({ ...p, slug, files: [...new Set(p.files.filter((f) => known.has(f)))] });
  }
  return out;
}

export async function planOutline(ctx: RepoContext, generationId?: string): Promise<{ outline: OutlinePage[]; tokensIn: number; tokensOut: number }> {
  const manifests = Object.entries(ctx.manifests)
    .map(([f, c]) => `### ${f}\n${c}`)
    .join("\n\n");
  let tree = ctx.tree.join("\n");
  if (tree.length > 25_000) tree = tree.slice(0, 25_000) + "\n…(truncated)";
  const prompt = `You are planning a wiki-style documentation site for the GitHub repository ${ctx.owner}/${ctx.name}.
${ctx.description ? `Description: ${ctx.description}\n` : ""}
${ctx.license ? `Repository SPDX license: ${ctx.license}. Preserve accurate attribution and do not imply broader reuse permissions.\n` : "Repository license: not identified. Do not make claims about reuse permissions.\n"}
Produce an outline of 8 to 14 pages for a typical repository, ordered from high level to detailed. Use fewer pages only when the repository is genuinely small or lacks distinct subsystems; do not compress several independent topics into one broad page just to keep the outline short. A page is a navigable wiki section, not a heading within another page.

Cover each topic below when supported by the repository, using separate pages for substantial topics:
1. Overview (slug "overview"): purpose, audience, key features, tech stack, repo layout.
2. Architecture: components, boundaries, and design decisions.
3. Getting started & development: install, build, run, test, and project scripts.
4. Configuration & environment: environment variables, config files, deployment, and CI.
5. Major modules or product features: give each substantial subsystem its own page, rather than combining unrelated modules.
6. Public API, CLI, or user-facing workflows, when present.
7. Data models, persistence, and important data flows, when present.
8. Integrations, background jobs, or infrastructure, when present.
9. Testing, security/authentication, operations, and extension points when relevant; split these into distinct pages when the codebase has enough material.
Do not invent pages the code does not support, and avoid duplicate pages that cover the same files and responsibilities. Slugs must be lowercase kebab-case. For each page give a summary stating exactly what it should explain, and list 1 to 8 repo-relative file paths (exact paths from the file tree below) the author must read; prefer entry points and files central to the topic.

## Automated analysis
${formatAnalysis(analyzeRepo(ctx))}

## File tree
${tree}

## Manifests
${manifests || "(none)"}

## README
${ctx.readme || "(none)"}`.slice(0, MAX_PROMPT_CHARS);

  try {
    const model = planModel();
    const llm = makeLlm(model, 0.2).withStructuredOutput(OutlineSchema, { includeRaw: true });
    const res = await withRetry(() => traceLlmCall("plan", model, generationId, () => llm.invoke(prompt), (result) => {
      const usage = (result.raw as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata;
      return { input: usage?.input_tokens ?? 0, output: usage?.output_tokens ?? 0 };
    }));
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
