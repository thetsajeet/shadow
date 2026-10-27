import { promises as fs } from "node:fs";
import path from "node:path";
import { sourceUrl } from "../github";
import { getJob, updateJob } from "../jobs";
import { llmError, makeLlm, withRetry } from "./llm";
import { getModel, type GraphStateType, type OutlinePage } from "./state";

const PER_FILE_CHARS = 12_000;
const PER_PAGE_CHARS = 48_000;

export interface PageInput {
  page: OutlinePage;
  state: GraphStateType;
}

export async function generatePage({ page, state }: PageInput): Promise<Partial<GraphStateType>> {
  const job = getJob(state.jobId);
  const total = job?.progress.total ?? 0;
  const startedCount = (job?.progress.done ?? 0) + 1;
  updateJob(state.jobId, { step: `Writing page ${Math.min(startedCount, total)}/${total}: ${page.title}` });

  const clonePath = path.join(state.workdir, "repo");
  let budget = PER_PAGE_CHARS;
  const chunks: string[] = [];
  for (const f of page.files) {
    if (budget <= 0) break;
    try {
      const raw = await fs.readFile(path.join(clonePath, f), "utf8");
      const text = raw.slice(0, Math.min(PER_FILE_CHARS, budget));
      budget -= text.length;
      chunks.push(`### FILE: ${f}\nSource link: ${sourceUrl(state.repo, state.sha, f)}\n\`\`\`\n${text}\n\`\`\``);
    } catch {
      /* skip unreadable */
    }
  }

  const { user, repo } = state.repo;
  const prompt = `You are a senior engineer writing one page of a wiki for the GitHub repo ${user}/${repo}.

Page title: ${page.title}
Page purpose: ${page.summary}
Other pages in the wiki: ${state.outline.map((p) => p.title).join(", ")}

Write the page in GitHub-flavoured Markdown. Requirements:
- Do NOT include the page title as an H1; start with an intro paragraph, then use ## and ### headings.
- Be accurate and grounded ONLY in the provided files and README; do not invent APIs.
- Include Mermaid diagrams in \`\`\`mermaid fenced blocks where they help (architecture, flows, sequences). Use simple, valid syntax; quote labels containing special characters.
- Use tables and code snippets where helpful.
- Cite sources inline as Markdown links using the exact "Source link" URLs given, e.g. [\`src/app.ts\`](https://github.com/${user}/${repo}/blob/${state.sha}/src/app.ts).
- Output only the Markdown.

## README (context)
${state.readme.slice(0, 6000)}

## Files
${chunks.join("\n\n") || "(no specific files; rely on README and file tree)"}

${chunks.length ? "" : `## File tree\n${state.tree.slice(0, 200).join("\n")}`}`;

  let markdown: string;
  try {
    const llm = makeLlm(getModel(), 0.3);
    const res = await withRetry(() => llm.invoke(prompt));
    markdown =
      typeof res.content === "string"
        ? res.content
        : res.content.map((c) => ("text" in c ? c.text : "")).join("");
  } catch (e) {
    throw llmError(e);
  }
  markdown = markdown.replace(/^```(?:markdown|md)\n([\s\S]*?)\n```\s*$/i, "$1").trim();

  const cur = getJob(state.jobId);
  updateJob(state.jobId, { progress: { done: (cur?.progress.done ?? 0) + 1, total } });
  return { pages: [{ slug: page.slug, title: page.title, summary: page.summary, markdown }] };
}
