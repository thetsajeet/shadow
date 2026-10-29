import { describe, expect, it } from "vitest";
import { gitBlobSha, keepPath, languageOf, redactSecrets } from "../snapshot";

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
    expect(keepPath("private.pem", 100)).toBe(false);
  });
  it("detects language", () => {
    expect(languageOf("a/b.py")).toBe("python");
    expect(languageOf("LICENSE")).toBeNull();
  });
  it("redacts common credentials and all values in local dotenv files", () => {
    expect(redactSecrets("TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890", "config.ts")).toContain("TOKEN=[REDACTED]");
    expect(redactSecrets("DATABASE_URL=postgres://secret\nDEBUG=true", ".env")).toBe("DATABASE_URL=[REDACTED]\nDEBUG=[REDACTED]");
    expect(redactSecrets("API_KEY=replace-me", ".env.example")).toBe("API_KEY=replace-me");
  });
});
