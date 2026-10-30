import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_DIRECT: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  GITHUB_TOKEN: z.string().min(1),
  MODEL_PROVIDER: z.enum(["google", "openai"]).default("google"),
  EMBEDDING_PROVIDER: z.enum(["google", "openai"]).default("google"),
  GOOGLE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.1-flash-lite"),
  GEMINI_PLAN_MODEL: z.string().optional(),
  GEMINI_EMBED_MODEL: z.string().default("gemini-embedding-001"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_EMBED_MODEL: z.string().default("text-embedding-3-small"),
  MODEL_NAME: z.string().optional(),
  PLAN_MODEL_NAME: z.string().optional(),
  EMBEDDING_MODEL_NAME: z.string().optional(),
  SENTRY_DSN: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  GENERATION_ENABLED: z.enum(["true", "false"]).default("true"),
  MAX_GENERATION_TOKENS: z.coerce.number().int().positive().default(500_000),
  DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(1_000_000),
  RATE_LIMIT_GENERATION_PER_IP: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_CHAT_PER_IP: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(3600),
  DATA_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  SESSION_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  // read:user for the profile; repo is needed to read the user's private repositories.
  GITHUB_OAUTH_SCOPES: z.string().default("read:user,user:email,repo"),
}).superRefine((value, ctx) => {
  if (value.MODEL_PROVIDER === "google" && !value.GOOGLE_API_KEY) {
    ctx.addIssue({ code: "custom", path: ["GOOGLE_API_KEY"], message: "Required when MODEL_PROVIDER=google" });
  }
  if (value.MODEL_PROVIDER === "openai" && !value.OPENAI_API_KEY) {
    ctx.addIssue({ code: "custom", path: ["OPENAI_API_KEY"], message: "Required when MODEL_PROVIDER=openai" });
  }
  if (value.EMBEDDING_PROVIDER === "google" && !value.GOOGLE_API_KEY) {
    ctx.addIssue({ code: "custom", path: ["GOOGLE_API_KEY"], message: "Required when EMBEDDING_PROVIDER=google" });
  }
  if (value.EMBEDDING_PROVIDER === "openai" && !value.OPENAI_API_KEY) {
    ctx.addIssue({ code: "custom", path: ["OPENAI_API_KEY"], message: "Required when EMBEDDING_PROVIDER=openai" });
  }
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Lazily validated so `next build` works without secrets; fails fast on first real use. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
