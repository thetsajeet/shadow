import { NonRetriableError } from "inngest";
import { describe, expect, it, vi } from "vitest";
import { ShadowError } from "../errors";
import { decodeError, guard } from "../errors-codec";

const llm = vi.hoisted(() => ({ make: vi.fn(), invoke: vi.fn() }));
vi.mock("../pipeline/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../pipeline/llm")>();
  return {
    ...actual,
    makeLlm: llm.make,
    withRetry: (fn: () => Promise<unknown>) => fn(),
    llmError: (error: unknown) => error,
  };
});

import { normalizeOutline, planOutline } from "../pipeline/plan";

describe("normalizeOutline", () => {
  it("drops unknown files, sanitizes and dedupes slugs, caps pages", () => {
    const out = normalizeOutline(
      [
        { slug: "Over View!", title: "A", summary: "", files: ["a.ts", "ghost.ts", "a.ts"] },
        { slug: "over-view", title: "B", summary: "", files: [] },
        ...Array.from({ length: 20 }, (_, i) => ({ slug: `p${i}`, title: "x", summary: "", files: [] })),
      ],
      ["a.ts"],
    );
    expect(out[0]).toMatchObject({ slug: "over-view", files: ["a.ts"] });
    expect(out[1].slug).toBe("over-view-2");
    expect(out).toHaveLength(14);
  });

  it("plans with a mocked LLM, filters unknown files, and records provider usage", async () => {
    llm.invoke.mockResolvedValue({
      parsed: {
        pages: [
          { slug: "Overview!", title: "Overview", summary: "Project overview", files: ["README.md", "unknown.ts"] },
          { slug: "chat", title: "Chat docs", summary: "Chat workflow", files: ["src/app.ts"] },
        ],
      },
      raw: { usage_metadata: { input_tokens: 120, output_tokens: 45 } },
    });
    llm.make.mockReturnValue({
      withStructuredOutput: () => ({ invoke: llm.invoke }),
    });
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    vi.stubEnv("GOOGLE_API_KEY", "test-google-key");
    vi.stubEnv("SESSION_SECRET", "test-session-secret-long-enough");
    vi.stubEnv("GITHUB_CLIENT_ID", "test-client");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "test-secret");
    vi.stubEnv("MODEL_PROVIDER", "google");
    vi.stubEnv("EMBEDDING_PROVIDER", "google");

    const result = await planOutline({
      owner: "acme",
      name: "widgets",
      sha: "abc123",
      description: null,
      tree: ["README.md", "src/app.ts"],
      readme: "A test repository",
      manifests: {},
    });

    expect(result).toEqual({
      outline: [
        { slug: "overview", title: "Overview", summary: "Project overview", files: ["README.md"] },
        { slug: "chat-docs", title: "Chat docs", summary: "Chat workflow", files: ["src/app.ts"] },
      ],
      tokensIn: 120,
      tokensOut: 45,
    });
    expect(llm.invoke).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });
});

describe("error codec", () => {
  it("makes permanent errors non-retriable and keeps the code", async () => {
    const err = await guard(async () => {
      throw new ShadowError("TOO_LARGE", "big");
    }).catch((e) => e);
    expect(err).toBeInstanceOf(NonRetriableError);
    expect(decodeError(err)).toEqual({ code: "TOO_LARGE", message: "big" });
  });
  it("keeps retriable errors retriable", async () => {
    const err = await guard(async () => {
      throw new ShadowError("RATE_LIMITED", "slow down", true);
    }).catch((e) => e);
    expect(err).not.toBeInstanceOf(NonRetriableError);
    expect(decodeError(err).code).toBe("RATE_LIMITED");
  });
  it("falls back to INTERNAL / TIMEOUT", () => {
    expect(decodeError(new Error("boom")).code).toBe("INTERNAL");
    expect(decodeError(new Error("request timed out")).code).toBe("TIMEOUT");
  });
});
