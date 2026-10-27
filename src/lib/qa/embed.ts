import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";
import { EMBED_DIMS } from "@/db/schema";
import { env } from "@/env";
import { withRetry } from "../pipeline/llm";

const BATCH = 100;

export async function embedTexts(values: string[], kind: "document" | "query"): Promise<number[][]> {
  const google = createGoogleGenerativeAI({ apiKey: env().GOOGLE_API_KEY });
  const model = google.embedding(env().GEMINI_EMBED_MODEL);
  const out: number[][] = [];
  for (let i = 0; i < values.length; i += BATCH) {
    const res = await withRetry(() =>
      embedMany({
        model,
        values: values.slice(i, i + BATCH),
        providerOptions: {
          google: { outputDimensionality: EMBED_DIMS, taskType: kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY" },
        },
      }),
    );
    out.push(...res.embeddings);
  }
  return out;
}
