import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { env } from "@/env";
import { ShadowError } from "../errors";

export function makeLlm(model: string, temperature = 0.3) {
  return new ChatGoogleGenerativeAI({ model, temperature, apiKey: env().GOOGLE_API_KEY, maxRetries: 0 });
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
