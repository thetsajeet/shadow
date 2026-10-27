import { describe, expect, it } from "vitest";
import { parseRepoUrl } from "../repo-url";

describe("parseRepoUrl", () => {
  it.each([
    ["https://github.com/a/b", "a", "b"],
    ["https://github.com/a/b.git", "a", "b"],
    ["https://github.com/a/b/", "a", "b"],
    ["https://github.com/a/b/tree/main/src", "a", "b"],
  ])("accepts %s", (url, user, repo) => {
    expect(parseRepoUrl(url)).toEqual({ user, repo });
  });

  it.each([
    "http://github.com/a/b",
    "https://evil.com/a/b",
    "https://github.com/a",
    "https://github.com/a/b/issues/1",
    "https://github.com/a/..",
    "not a url",
  ])("rejects %s", (url) => {
    expect(() => parseRepoUrl(url)).toThrowError();
  });
});
