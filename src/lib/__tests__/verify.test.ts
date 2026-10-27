import { describe, expect, it } from "vitest";
import { verifyMarkdown } from "../pipeline/verify";

const base = { owner: "o", name: "r", sha: "abc", tree: new Set(["src/a.ts"]), slugs: new Set(["overview"]), lineCounts: { "src/a.ts": 20 } };
const u = "https://github.com/o/r/blob/abc/src/a.ts";

describe("verifyMarkdown", () => {
  it("keeps valid citations and clamps line ranges", () => {
    const r = verifyMarkdown({ ...base, markdown: `[a](${u}#L2-L99) [b](${u}#L3)` });
    expect(r.markdown).toContain(`${u}#L2-L20`);
    expect(r.markdown).toContain(`${u}#L3)`);
    expect(r.stats.brokenCitations).toBe(0);
  });
  it("strips anchors beyond the file and links to unknown files", () => {
    const r = verifyMarkdown({ ...base, markdown: `[a](${u}#L50) [x](https://github.com/o/r/blob/abc/nope.ts#L1)` });
    expect(r.markdown).toContain(`[a](${u})`);
    expect(r.markdown).toContain("`x`");
    expect(r.stats.brokenCitations).toBe(2);
  });
  it("removes broken internal links", () => {
    const r = verifyMarkdown({ ...base, markdown: "[ok](/wiki/o/r/overview) [bad](/wiki/o/r/ghost)" });
    expect(r.markdown).toBe("[ok](/wiki/o/r/overview) bad");
  });
  it("downgrades invalid mermaid blocks", () => {
    const r = verifyMarkdown({ ...base, markdown: "```mermaid\nhello\n```\n```mermaid\ngraph TD\nA-->B\n```" });
    expect(r.stats.droppedMermaid).toBe(1);
    expect(r.markdown).toContain("```text\nhello");
    expect(r.markdown).toContain("```mermaid\ngraph TD");
  });
});
