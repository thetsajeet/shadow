import { describe, expect, it } from "vitest";
import { chunkCode, chunkMarkdown } from "../qa/chunk";

describe("chunkCode", () => {
  it("covers all lines with overlap and valid ranges", () => {
    const src = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`).join("\n");
    const cs = chunkCode(src);
    expect(cs[0].startLine).toBe(1);
    expect(cs.at(-1)!.endLine).toBe(150);
    for (let i = 1; i < cs.length; i++) expect(cs[i].startLine).toBeLessThanOrEqual(cs[i - 1].endLine);
    expect(cs.every((c) => c.content.length <= 2000)).toBe(true);
  });
  it("skips blank content and handles one huge line", () => {
    expect(chunkCode("\n\n")).toEqual([]);
    expect(chunkCode("x".repeat(5000))[0].content).toHaveLength(2000);
  });
});

describe("chunkMarkdown", () => {
  it("splits on h2/h3 but not inside fences", () => {
    const md = "intro\n## A\ntext\n```\n## not a heading\n```\n### B\nmore";
    const cs = chunkMarkdown(md);
    expect(cs.map((c) => c.content.split("\n")[0])).toEqual(["intro", "## A", "### B"]);
  });
});
