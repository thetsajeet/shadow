import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { EMBED_DIMS } from "@/db/schema";
import { env } from "@/env";
import { withRetry } from "../pipeline/llm";
import { selectedEmbeddingModel } from "../pipeline/models";

const BATCH = 100;

export async function embedTexts(values: string[], kind: "document" | "query"): Promise<number[][]> {
  const config = env();
  const model = config.EMBEDDING_PROVIDER === "google"
    ? createGoogleGenerativeAI({ apiKey: config.GOOGLE_API_KEY! }).embedding(selectedEmbeddingModel())
    : createOpenAI({ apiKey: config.OPENAI_API_KEY! }).embeddingModel(selectedEmbeddingModel());
  const out: number[][] = [];
  for (let i = 0; i < values.length; i += BATCH) {
    const res = await withRetry(() =>
      embedMany({
        model,
        values: values.slice(i, i + BATCH),
        ...(config.EMBEDDING_PROVIDER === "google" && {
          providerOptions: {
            google: { outputDimensionality: EMBED_DIMS, taskType: kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY" },
          },
        }),
        ...(config.EMBEDDING_PROVIDER === "openai" && { providerOptions: { openai: { dimensions: EMBED_DIMS } } }),
      }),
    );
    out.push(...res.embeddings);
  }
  return out;
}
