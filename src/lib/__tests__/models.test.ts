import { describe, expect, it } from "vitest";
import { chooseChatModel, chooseEmbeddingModel } from "../pipeline/models";
import { estimateCostMicros } from "../security-controls";

describe("model configuration", () => {
  const settings = {
    MODEL_PROVIDER: "google" as const,
    EMBEDDING_PROVIDER: "google" as const,
    GEMINI_MODEL: "gemini-main",
    GEMINI_PLAN_MODEL: undefined,
    GEMINI_EMBED_MODEL: "gemini-embed",
    OPENAI_MODEL: "gpt-4o-mini",
    OPENAI_EMBED_MODEL: "text-embedding-3-small",
    MODEL_NAME: undefined,
    PLAN_MODEL_NAME: undefined,
    EMBEDDING_MODEL_NAME: undefined,
  };

  it("uses provider defaults and supports per-task model overrides", () => {
    expect(chooseChatModel(settings, "write")).toBe("gemini-main");
    expect(chooseChatModel({ ...settings, MODEL_PROVIDER: "openai" }, "chat")).toBe("gpt-4o-mini");
    expect(chooseChatModel({ ...settings, MODEL_PROVIDER: "openai", PLAN_MODEL_NAME: "gpt-plan" }, "plan")).toBe("gpt-plan");
    expect(chooseEmbeddingModel({ ...settings, EMBEDDING_PROVIDER: "openai" })).toBe("text-embedding-3-small");
    expect(chooseEmbeddingModel({ ...settings, EMBEDDING_MODEL_NAME: "custom-embed" })).toBe("custom-embed");
  });

  it("estimates cost in microdollars for stored usage", () => {
    expect(estimateCostMicros("gpt-4o-mini", 1000, 1000)).toBe(750);
    expect(estimateCostMicros("text-embedding-3-small", 1000, 0)).toBe(20);
  });
});
