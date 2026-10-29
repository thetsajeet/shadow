import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { generations, rateLimitCounters, repos, tokenBudgets } from "@/db/schema";
import { env } from "@/env";
import { ShadowError } from "./errors";

type RequestLimit = "generate" | "chat";

function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip")?.trim()
    || headers.get("x-real-ip")?.trim()
    || headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || "unknown";
}

export function turnstileEnabled(): boolean {
  return Boolean(env().NEXT_PUBLIC_TURNSTILE_SITE_KEY && env().TURNSTILE_SECRET_KEY);
}

export async function enforceRequestControls(req: Request, kind: RequestLimit): Promise<void> {
  const config = env();
  if (!turnstileEnabled()) {
    if (process.env.NODE_ENV === "production") {
      throw new ShadowError("INTERNAL", "Anti-bot protection is not configured.");
    }
  } else {
    const token = req.headers.get("x-turnstile-token");
    if (!token) throw new ShadowError("FORBIDDEN", "Complete the verification challenge first.");
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: config.TURNSTILE_SECRET_KEY!,
        response: token,
        remoteip: clientIp(req.headers),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new ShadowError("INTERNAL", "Could not verify the request.");
    const result = await response.json() as { success?: boolean };
    if (!result.success) throw new ShadowError("FORBIDDEN", "Verification failed. Please try again.");
  }

  const ipKey = createHmac("sha256", config.SESSION_SECRET).update(clientIp(req.headers)).digest("hex");
  const key = `${kind}:${ipKey}`;
  const now = new Date();
  const windowMs = config.RATE_LIMIT_WINDOW_SECONDS * 1000;
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const limit = kind === "generate" ? config.RATE_LIMIT_GENERATION_PER_IP : config.RATE_LIMIT_CHAT_PER_IP;
  const [counter] = await db()
    .insert(rateLimitCounters)
    .values({ key, windowStart: start, count: 1 })
    .onConflictDoUpdate({
      target: rateLimitCounters.key,
      set: {
        count: sql`CASE WHEN ${rateLimitCounters.windowStart} < ${start} THEN 1 ELSE ${rateLimitCounters.count} + 1 END`,
        windowStart: sql`GREATEST(${rateLimitCounters.windowStart}, ${start})`,
      },
    })
    .returning({ count: rateLimitCounters.count });
  if ((counter?.count ?? limit + 1) > limit) {
    throw new ShadowError("RATE_LIMITED", "Too many requests. Please try again later.", true);
  }
}

export async function assertGenerationAllowed(): Promise<void> {
  if (env().GENERATION_ENABLED !== "true") {
    throw new ShadowError("RATE_LIMITED", "Documentation generation is temporarily paused.", true);
  }
}

export async function assertTokenBudget(generationId: string, estimatedTokens = 20_000): Promise<void> {
  await assertGenerationAllowed();
  const config = env();
  const [gen] = await db()
    .select({ userId: repos.ownerUserId })
    .from(generations)
    .innerJoin(repos, eq(generations.repoId, repos.id))
    .where(eq(generations.id, generationId));
  if (!gen) throw new ShadowError("INTERNAL", "Generation budget could not be checked.");
  if (!gen.userId) throw new ShadowError("UNAUTHENTICATED", "Repository owner is no longer available.");
  const userId = gen.userId;
  await db().transaction(async (tx) => {
    await reserveTokens(tx, `generation:${generationId}`, estimatedTokens, config.MAX_GENERATION_TOKENS);
    await reserveTokens(tx, dailyBudgetKey(userId), estimatedTokens, config.DAILY_TOKEN_BUDGET);
  });
}

export async function assertChatBudget(userId: string, estimatedTokens = 8_000): Promise<void> {
  if (env().GENERATION_ENABLED !== "true") {
    throw new ShadowError("RATE_LIMITED", "AI features are temporarily paused.", true);
  }
  await db().transaction((tx) => reserveTokens(tx, dailyBudgetKey(userId), estimatedTokens, env().DAILY_TOKEN_BUDGET));
}

function dailyBudgetKey(userId: string): string {
  return `daily:${userId}:${new Date().toISOString().slice(0, 10)}`;
}

async function reserveTokens(tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0], key: string, amount: number, limit: number) {
  const [reserved] = await tx
    .insert(tokenBudgets)
    .values({ key, tokensReserved: amount })
    .onConflictDoUpdate({
      target: tokenBudgets.key,
      set: { tokensReserved: sql`${tokenBudgets.tokensReserved} + ${amount}` },
      where: sql`${tokenBudgets.tokensReserved} + ${amount} <= ${limit}`,
    })
    .returning({ key: tokenBudgets.key });
  if (!reserved) throw new ShadowError("RATE_LIMITED", "Your AI token budget has been reached.", true);
}

export function estimateCostMicros(model: string, tokensIn: number, tokensOut: number): number {
  const rates = model.startsWith("gpt-4o-mini") ? { input: 0.15, output: 0.6 } :
    model.startsWith("gpt-4o") ? { input: 2.5, output: 10 } :
      model.startsWith("text-embedding") ? { input: 0.02, output: 0 } : { input: 0.1, output: 0.4 };
  return Math.round(tokensIn * rates.input + tokensOut * rates.output);
}
