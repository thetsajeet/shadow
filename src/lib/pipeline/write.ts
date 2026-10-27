import { blobUrl } from "../urls";
import { contentToText, llmError, makeLlm, withRetry } from "./llm";
import { writeModel, type OutlinePage, type RepoContext } from "./types";

const PER_FILE_CHARS = 12_000;
const PER_PAGE_CHARS = 48_000;

export interface WriteInput {
  ctx: RepoContext;
  page: OutlinePage;
  outline: Pick<OutlinePage, "slug" | "title">[];
  files: Record<string, string>;
}

export async function writePage({ ctx, page, outline, files }: WriteInput) {
  const ref = { user: ctx.owner, repo: ctx.name };
  let budget = PER_PAGE_CHARS;
  const chunks: string[] = [];
  for (const f of page.files) {
    const raw = files[f];
    if (raw === undefined || budget <= 0) continue;
    const text = raw.slice(0, Math.min(PER_FILE_CHARS, budget));
    budget -= text.length;
    chunks.push(`### FILE: ${f}\nSource link: ${blobUrl(ref, ctx.sha, f)}\n\`\`\`\n${text}\n\`\`\``);
  }

  const prompt = `You are a senior engineer writing one page of a wiki for the GitHub repo ${ctx.owner}/${ctx.name}.

Page title: ${page.title}
Page purpose: ${page.summary}
Other pages in the wiki: ${outline.map((p) => p.title).join(", ")}

Write the page in GitHub-flavoured Markdown. Requirements:
- Do NOT include the page title as an H1; start with an intro paragraph, then use ## and ### headings.
- Be accurate and grounded ONLY in the provided files and README; do not invent APIs.
- Include Mermaid diagrams in \`\`\`mermaid fenced blocks where they help (architecture, flows, sequences). Use simple, valid syntax; quote labels containing special characters.
- Use tables and code snippets where helpful.
- Cite sources inline as Markdown links using the exact "Source link" URLs given, e.g. [\`src/app.ts\`](${blobUrl(ref, ctx.sha, "src/app.ts")}).
- Output only the Markdown.

## README (context)
${ctx.readme.slice(0, 6000)}

## Files
${chunks.join("\n\n") || "(no specific files; rely on README and file tree)"}

${chunks.length ? "" : `## File tree\n${ctx.tree.slice(0, 200).join("\n")}`}`;

  try {
    const res = await withRetry(() => makeLlm(writeModel(), 0.3).invoke(prompt));
    const markdown = contentToText(res.content)
      .replace(/^```(?:markdown|md)\n([\s\S]*?)\n```\s*$/i, "$1")
      .trim();
    if (!markdown) throw new Error("Model returned an empty page");
    return {
      markdown,
      tokensIn: res.usage_metadata?.input_tokens ?? 0,
      tokensOut: res.usage_metadata?.output_tokens ?? 0,
    };
  } catch (e) {
    throw llmError(e);
  }
}
