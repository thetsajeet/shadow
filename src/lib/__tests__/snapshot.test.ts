import { describe, expect, it } from "vitest";
import { gitBlobSha, keepPath, languageOf } from "../snapshot";

describe("snapshot helpers", () => {
  it("matches git's blob hash", () => {
    expect(gitBlobSha(new TextEncoder().encode("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
  it("filters noise", () => {
    expect(keepPath("src/a.ts", 100)).toBe(true);
    expect(keepPath("node_modules/x/index.js", 100)).toBe(false);
    expect(keepPath("bun.lock", 100)).toBe(false);
    expect(keepPath("logo.png", 100)).toBe(false);
    expect(keepPath("big.ts", 300 * 1024)).toBe(false);
    expect(keepPath("empty.ts", 0)).toBe(false);
  });
  it("detects language", () => {
    expect(languageOf("a/b.py")).toBe("python");
    expect(languageOf("LICENSE")).toBeNull();
  });
});
