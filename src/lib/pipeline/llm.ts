import * as Sentry from "@sentry/nextjs";
import { ShadowError } from "../errors";
import { env } from "@/env";
import { estimateCostMicros } from "../security-controls";
import { makeLangChainChatModel } from "./models";

type TokenUsage = { input: number; output: number };

export async function traceLlmCall<T>(
  task: "plan" | "write",
  model: string,
  generationId: string | undefined,
  invoke: () => Promise<T>,
  readUsage: (result: T) => TokenUsage,
): Promise<T> {
  return Sentry.startSpan({
    name: `llm.${task}`,
    op: "gen_ai.request",
    attributes: {
      "gen_ai.system": env().MODEL_PROVIDER,
      "gen_ai.request.model": model,
      ...(generationId ? { "shadow.generation_id": generationId } : {}),
    },
  }, async (span) => {
    const result = await invoke();
    const usage = readUsage(result);
    span.setAttribute("gen_ai.usage.input_tokens", usage.input);
    span.setAttribute("gen_ai.usage.output_tokens", usage.output);
    span.setAttribute("gen_ai.usage.cost_usd", estimateCostMicros(model, usage.input, usage.output) / 1_000_000);
    return result;
  });
}

export function makeLlm(model: string, temperature = 0.3) {
  return makeLangChainChatModel(model, temperature);
}

function isTransient(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return /429|rate.?limit|quota|RESOURCE_EXHAUSTED|503|overloaded|unavailable/i.test(m);
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let delay = 2000;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts - 1 || !isTransient(e)) throw e;
      await new Promise((r) => setTimeout(r, delay + Math.random() * 500));
      delay *= 2;
    }
  }
}

export function llmError(e: unknown): ShadowError {
  const m = e instanceof Error ? e.message : String(e);
  return new ShadowError("LLM_ERROR", `LLM error: ${m.slice(0, 300)}`, isTransient(e));
}

export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : "")).join("");
  }
  return "";
}
