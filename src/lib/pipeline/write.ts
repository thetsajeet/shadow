import { blobUrl } from "../urls";
import { verifyMarkdown } from "./verify";
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
    const numbered = text.split("\n").map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join("\n");
    chunks.push(`### FILE: ${f}\nSource link: ${blobUrl(ref, ctx.sha, f)}\n\`\`\`\n${numbered}\n\`\`\``);
  }

  const prompt = `You are a senior engineer writing one page of a wiki for the GitHub repo ${ctx.owner}/${ctx.name}.

Page title: ${page.title}
Page purpose: ${page.summary}
Other pages in the wiki (link to them where relevant with relative links): ${outline.map((p) => `[${p.title}](/wiki/${ctx.owner}/${ctx.name}/${p.slug})`).join(", ")}

Write a thorough, well-structured page in GitHub-flavoured Markdown. Requirements:
- Do NOT include the page title as an H1; start with a short intro paragraph saying what this page covers, then use ## and ### headings.
- Explain the "why" and how things work, not just what files exist: responsibilities, key functions/classes, control flow, data structures, edge cases and gotchas.
- Be accurate and grounded ONLY in the provided files and README; never invent APIs, flags or behaviour. If something is unclear, say so.
- Files are shown with line numbers in the form "  12| code". Do not copy the line-number prefix into code snippets.
- Cite sources inline as Markdown links using the file's "Source link" with a line anchor, e.g. [\`src/app.ts:10-24\`](${blobUrl(ref, ctx.sha, "src/app.ts")}#L10-L24). Cite specific line ranges for non-trivial claims.
- Include at least one Mermaid diagram in a \`\`\`mermaid block when the topic involves structure or flow (flowchart, sequenceDiagram, classDiagram). Use simple valid syntax; wrap labels containing special characters in double quotes; avoid parentheses in unquoted labels.
- Use short code snippets, tables (e.g. options, APIs) and lists where they aid understanding.
- End with a "## Related pages" section linking 2 to 4 relevant pages from the list above.
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
    const verified = verifyMarkdown({
      markdown,
      owner: ctx.owner,
      name: ctx.name,
      sha: ctx.sha,
      tree: new Set(ctx.tree),
      slugs: new Set(outline.map((p) => p.slug)),
      lineCounts: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.split("\n").length])),
    });
    return {
      markdown: verified.markdown,
      stats: verified.stats,
      tokensIn: res.usage_metadata?.input_tokens ?? 0,
      tokensOut: res.usage_metadata?.output_tokens ?? 0,
    };
  } catch (e) {
    throw llmError(e);
  }
}
