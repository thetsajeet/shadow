import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { env, type Env } from "@/env";

type ModelSettings = Pick<Env, "MODEL_PROVIDER" | "GEMINI_MODEL" | "GEMINI_PLAN_MODEL" | "OPENAI_MODEL" | "MODEL_NAME" | "PLAN_MODEL_NAME">;
type EmbeddingSettings = Pick<Env, "EMBEDDING_PROVIDER" | "GEMINI_EMBED_MODEL" | "OPENAI_EMBED_MODEL" | "EMBEDDING_MODEL_NAME">;

export function chooseChatModel(config: ModelSettings, role: "plan" | "write" | "chat"): string {
  const providerDefault = config.MODEL_PROVIDER === "google" ? config.GEMINI_MODEL : config.OPENAI_MODEL;
  return role === "plan"
    ? config.PLAN_MODEL_NAME ?? config.GEMINI_PLAN_MODEL ?? config.MODEL_NAME ?? providerDefault
    : config.MODEL_NAME ?? providerDefault;
}

export function chooseEmbeddingModel(config: EmbeddingSettings): string {
  return config.EMBEDDING_MODEL_NAME ?? (config.EMBEDDING_PROVIDER === "google" ? config.GEMINI_EMBED_MODEL : config.OPENAI_EMBED_MODEL);
}

export function selectedChatModel(role: "plan" | "write" | "chat"): string {
  return chooseChatModel(env(), role);
}

export function selectedEmbeddingModel(): string {
  const config = env();
  return chooseEmbeddingModel(config);
}

export function makeLangChainChatModel(model: string, temperature: number) {
  const config = env();
  if (config.MODEL_PROVIDER === "google") {
    return new ChatGoogleGenerativeAI({ apiKey: config.GOOGLE_API_KEY!, model, temperature, maxRetries: 0 });
  }
  return new ChatOpenAI({ apiKey: config.OPENAI_API_KEY!, model, temperature, maxRetries: 0 });
}

export function makeAiSdkChatModel(model: string): LanguageModel {
  const config = env();
  if (config.MODEL_PROVIDER === "google") {
    return createGoogleGenerativeAI({ apiKey: config.GOOGLE_API_KEY! })(model);
  }
  return createOpenAI({ apiKey: config.OPENAI_API_KEY! })(model);
}
