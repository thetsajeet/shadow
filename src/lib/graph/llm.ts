import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export function makeLlm(model: string, temperature = 0.3) {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is not configured on the server.");
  }
  return new ChatGoogleGenerativeAI({
    model,
    temperature,
    apiKey: process.env.GOOGLE_API_KEY,
    maxRetries: 0,
  });
}

function isRateLimit(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return /429|rate.?limit|quota|RESOURCE_EXHAUSTED|503|overloaded|unavailable/i.test(m);
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let delay = 2000;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts - 1 || !isRateLimit(e)) throw e;
      await new Promise((r) => setTimeout(r, delay + Math.random() * 500));
      delay *= 2;
    }
  }
}

export function llmError(e: unknown): Error {
  const m = e instanceof Error ? e.message : String(e);
  return new Error(`LLM error: ${m.slice(0, 300)}`);
}
