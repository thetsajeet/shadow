import { updateJob } from "../jobs";
import { llmError, makeLlm, withRetry } from "./llm";
import { getPlanModel, OutlineSchema, type GraphStateType, type OutlinePage } from "./state";

const MAX_PROMPT_CHARS = 60_000;

export async function planOutline(state: GraphStateType): Promise<Partial<GraphStateType>> {
  updateJob(state.jobId, { step: "Planning outline" });
  const { user, repo } = state.repo;

  const manifests = Object.entries(state.manifests)
    .map(([f, c]) => `### ${f}\n${c}`)
    .join("\n\n");
  let tree = state.tree.join("\n");
  if (tree.length > 25_000) tree = tree.slice(0, 25_000) + "\n…(truncated)";
  const prompt = `You are planning a wiki-style documentation site for the GitHub repository ${user}/${repo}.

Produce an outline of about 6 to 12 pages (fewer for tiny repos). Typical pages: Overview, Architecture, key modules/features, data flow, setup & development, configuration. Slugs must be lowercase kebab-case. The first page must have slug "overview". For each page list the repo-relative file paths (from the file tree below, exact paths only) that the page author should read.

## File tree
${tree}

## Manifests
${manifests || "(none)"}

## README
${state.readme || "(none)"}`.slice(0, MAX_PROMPT_CHARS);

  let result;
  try {
    const llm = makeLlm(getPlanModel(), 0.2).withStructuredOutput(OutlineSchema);
    result = await withRetry(() => llm.invoke(prompt));
  } catch (e) {
    throw llmError(e);
  }

  const known = new Set(state.tree);
  const seen = new Set<string>();
  const outline: OutlinePage[] = [];
  for (const p of result.pages.slice(0, 14)) {
    let slug = p.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "page";
    while (seen.has(slug)) slug += "-2";
    seen.add(slug);
    outline.push({ ...p, slug, files: [...new Set(p.files.filter((f) => known.has(f)))] });
  }
  updateJob(state.jobId, { progress: { done: 0, total: outline.length } });
  return { outline };
}
