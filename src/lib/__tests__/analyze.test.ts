import { describe, expect, it } from "vitest";
import { analyzeRepo } from "../pipeline/analyze";

describe("analyzeRepo", () => {
  const tree = [
    "src/index.ts", "src/util.ts", "src/util.test.ts", "app/page.tsx", "package.json",
    ".github/workflows/ci.yml", "Dockerfile", "docs/intro.md",
  ];
  const a = analyzeRepo({ tree, manifests: { "package.json": JSON.stringify({ scripts: { build: "tsc" }, dependencies: { zod: "1" } }) } });

  it("detects languages, ignoring tests", () => {
    expect(a.primaryLanguage).toBe("TypeScript");
    expect(a.languages[0].files).toBe(3);
    expect(a.testFiles).toBe(1);
  });
  it("detects entry points, ci, docker and manifest data", () => {
    expect(a.entryPoints).toContain("src/index.ts");
    expect(a.hasCi && a.hasDocker).toBe(true);
    expect(a.scripts.build).toBe("tsc");
    expect(a.dependencies).toContain("zod");
  });
  it("tolerates invalid package.json", () => {
    expect(analyzeRepo({ tree: [], manifests: { "package.json": "{" } }).dependencies).toEqual([]);
  });
});
