export interface Chunk {
  startLine: number;
  endLine: number;
  content: string;
}

const MAX_CHARS = 2000;
const MAX_LINES = 60;
const OVERLAP = 8;

/** Line-window chunking so every chunk maps to a citable line range. */
export function chunkCode(content: string): Chunk[] {
  const lines = content.split("\n");
  const out: Chunk[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = start;
    let chars = 0;
    while (end < lines.length && end - start < MAX_LINES && chars + lines[end].length + 1 <= MAX_CHARS) {
      chars += lines[end].length + 1;
      end++;
    }
    if (end === start) end = start + 1; // a single very long line
    const text = lines.slice(start, end).join("\n").slice(0, MAX_CHARS);
    if (text.trim()) out.push({ startLine: start + 1, endLine: end, content: text });
    if (end >= lines.length) break;
    start = Math.max(end - OVERLAP, start + 1);
  }
  return out;
}

/** Splits a wiki page on H2/H3 headings; oversize sections fall back to line windows. */
export function chunkMarkdown(markdown: string): Chunk[] {
  const lines = markdown.split("\n");
  const sections: { start: number; end: number }[] = [];
  let start = 0;
  let inFence = false;
  lines.forEach((l, i) => {
    if (/^```/.test(l)) inFence = !inFence;
    if (!inFence && i > start && /^#{2,3}\s/.test(l)) {
      sections.push({ start, end: i });
      start = i;
    }
  });
  sections.push({ start, end: lines.length });
  return sections.flatMap(({ start: s, end: e }) => {
    const text = lines.slice(s, e).join("\n");
    if (!text.trim()) return [];
    if (text.length <= MAX_CHARS) return [{ startLine: s + 1, endLine: e, content: text }];
    return chunkCode(text).map((c) => ({ ...c, startLine: c.startLine + s, endLine: c.endLine + s }));
  });
}
