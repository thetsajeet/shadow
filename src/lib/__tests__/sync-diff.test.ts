import { describe, expect, it } from "vitest";
import { diffFiles, planReuse, repinLinks, shouldReplan } from "../sync-diff";

const f = (path: string, blobSha: string) => ({ path, blobSha });

describe("diffFiles", () => {
  it("detects added, modified and removed by blob sha", () => {
    const d = diffFiles([f("a", "1"), f("b", "2"), f("c", "3")], [f("a", "1"), f("b", "9"), f("d", "4")]);
    expect(d).toEqual({ added: ["d"], modified: ["b"], removed: ["c"] });
  });
  it("reports nothing when identical", () => {
    expect(diffFiles([f("a", "1")], [f("a", "1")])).toEqual({ added: [], modified: [], removed: [] });
  });
});

describe("shouldReplan", () => {
  const prev = Array.from({ length: 20 }, (_, i) => f(`src/f${i}.ts`, "x"));
  it("keeps the outline for small changes", () => {
    expect(shouldReplan({ added: [], modified: ["src/f1.ts"], removed: [] }, prev)).toBe(false);
  });
  it("replans when more than 30% changed", () => {
    expect(shouldReplan({ added: [], modified: prev.slice(0, 7).map((p) => p.path), removed: [] }, prev)).toBe(true);
  });
  it("replans when a new top-level directory appears", () => {
    expect(shouldReplan({ added: ["services/new.ts"], modified: [], removed: [] }, prev)).toBe(true);
  });
});

describe("planReuse", () => {
  const pages = [
    { slug: "a", sourceFiles: ["x.ts"], markdown: "A", status: "done" as const },
    { slug: "b", sourceFiles: ["y.ts"], markdown: "B", status: "done" as const },
    { slug: "c", sourceFiles: ["z.ts"], markdown: null, status: "error" as const },
  ];
  it("rewrites touched and unfinished pages, keeps the rest", () => {
    const plan = planReuse(pages, { added: [], modified: ["y.ts"], removed: [] });
    expect(plan.keep.map((p) => p.slug)).toEqual(["a"]);
    expect(plan.rewrite.map((p) => p.slug)).toEqual(["b", "c"]);
  });
  it("treats removed sources as touched", () => {
    expect(planReuse(pages, { added: [], modified: [], removed: ["x.ts"] }).rewrite.map((p) => p.slug)).toContain("a");
  });
});

describe("repinLinks", () => {
  it("rewrites only links for this repo and old sha", () => {
    const md = "[a](https://github.com/o/r/blob/old/a.ts#L1) [b](https://github.com/o/other/blob/old/b.ts)";
    expect(repinLinks(md, "o", "r", "old", "new")).toBe("[a](https://github.com/o/r/blob/new/a.ts#L1) [b](https://github.com/o/other/blob/old/b.ts)");
  });
});
