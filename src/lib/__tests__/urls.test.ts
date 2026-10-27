import { describe, expect, it } from "vitest";
import { blobUrl, commitUrl, refFromFullName } from "../urls";

const ref = { user: "u", repo: "r" };

describe("urls", () => {
  it("builds permalinks with line ranges", () => {
    expect(blobUrl(ref, "abc", "src/a b.ts", { start: 3, end: 9 })).toBe("https://github.com/u/r/blob/abc/src/a%20b.ts#L3-L9");
    expect(blobUrl(ref, "abc", "x.ts", { start: 5 })).toBe("https://github.com/u/r/blob/abc/x.ts#L5");
  });
  it("builds commit urls and parses full names", () => {
    expect(commitUrl(ref, "abc")).toBe("https://github.com/u/r/commit/abc");
    expect(refFromFullName("u/r")).toEqual(ref);
  });
});
