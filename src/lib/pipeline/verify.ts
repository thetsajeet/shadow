export interface VerifyInput {
  markdown: string;
  owner: string;
  name: string;
  sha: string;
  tree: Set<string>;
  slugs: Set<string>;
  /** line counts for files the model was shown (used to validate line anchors) */
  lineCounts: Record<string, number>;
}

export interface VerifyStats {
  citations: number;
  brokenCitations: number;
  brokenLinks: number;
  mermaidBlocks: number;
  droppedMermaid: number;
}

const DIAGRAMS =
  /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph|C4Context|quadrantChart|requirementDiagram|block-beta|sankey-beta|xychart-beta|architecture-beta)\b/;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Deterministically repairs citations, internal links and mermaid blocks. */
export function verifyMarkdown(input: VerifyInput): { markdown: string; stats: VerifyStats } {
  const stats: VerifyStats = { citations: 0, brokenCitations: 0, brokenLinks: 0, mermaidBlocks: 0, droppedMermaid: 0 };
  const prefix = `https://github.com/${input.owner}/${input.name}/blob/`;
  const citeRe = new RegExp(`\\[([^\\]]+)\\]\\(${esc(prefix)}([^/\\s)]+)/([^\\s)#]+)(?:#L(\\d+)(?:-L(\\d+))?)?\\)`, "g");

  let md = input.markdown.replace(citeRe, (_m, label: string, sha: string, path: string, a?: string, b?: string) => {
    stats.citations++;
    let p: string;
    try {
      p = decodeURIComponent(path);
    } catch {
      p = path;
    }
    if (!input.tree.has(p)) {
      stats.brokenCitations++;
      return `\`${label.replace(/`/g, "")}\``;
    }
    const base = `${prefix}${input.sha}/${path}`;
    if (!a) return `[${label}](${base})`;
    const total = input.lineCounts[p];
    const start = Number(a);
    const end = b ? Number(b) : start;
    if (total !== undefined && (start < 1 || start > total || end < start)) {
      stats.brokenCitations++;
      return `[${label}](${base})`;
    }
    const clampedEnd = total !== undefined ? Math.min(end, total) : end;
    return `[${label}](${base}#L${start}${clampedEnd > start ? `-L${clampedEnd}` : ""})`;
  });

  const wikiRe = new RegExp(`\\[([^\\]]+)\\]\\(/wiki/${esc(input.owner)}/${esc(input.name)}/([a-z0-9-]+)/?\\)`, "g");
  md = md.replace(wikiRe, (m, label: string, slug: string) => {
    if (input.slugs.has(slug)) return m;
    stats.brokenLinks++;
    return label;
  });

  md = md.replace(/```mermaid\n([\s\S]*?)```/g, (_m, body: string) => {
    stats.mermaidBlocks++;
    const code = body.trim();
    const first = code.split("\n").find((l) => l.trim() && !l.trim().startsWith("%%"))?.trim() ?? "";
    if (!DIAGRAMS.test(first) && !first.startsWith("---")) {
      stats.droppedMermaid++;
      return "```text\n" + code + "\n```";
    }
    return "```mermaid\n" + code + "\n```";
  });

  return { markdown: md, stats };
}
