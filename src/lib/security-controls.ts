import { createHmac, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { generations, rateLimitCounters, repos, tokenBudgets } from "@/db/schema";
import { env } from "@/env";
import { getTrustedClientIp } from "./client-ip";
import { ShadowError } from "./errors";

type RequestLimit = "generate" | "chat";

export function turnstileEnabled(): boolean {
  return Boolean(env().NEXT_PUBLIC_TURNSTILE_SITE_KEY && env().TURNSTILE_SECRET_KEY);
}

export async function enforceRequestControls(req: Request, kind: RequestLimit): Promise<void> {
  const config = env();
  const ip = getTrustedClientIp(req.headers);
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
        ...(ip !== "unknown" ? { remoteip: ip } : {}),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new ShadowError("INTERNAL", "Could not verify the request.");
    const result = await response.json() as { success?: boolean };
    if (!result.success) throw new ShadowError("FORBIDDEN", "Verification failed. Please try again.");
  }

  const ipKey = createHmac("sha256", config.SESSION_SECRET).update(ip).digest("hex");
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
        count: sql`CASE WHEN ${rateLimitCounters.windowStart} < ${start.toISOString()}::timestamptz THEN 1 ELSE ${rateLimitCounters.count} + 1 END`,
        windowStart: sql`GREATEST(${rateLimitCounters.windowStart}, ${start.toISOString()}::timestamptz)`,
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

export interface TokenReservation {
  key: string;
  counters: { key: string; limit: number }[];
}

export async function assertTokenBudget(generationId: string, operation: string, estimatedTokens = 20_000): Promise<TokenReservation> {
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
  const day = new Date().toISOString().slice(0, 10);
  const reservation = {
    key: `reservation:generation:${generationId}:${encodeURIComponent(operation)}:${day}`,
    counters: [
      { key: `generation:${generationId}`, limit: config.MAX_GENERATION_TOKENS },
      { key: dailyBudgetKey(userId, day), limit: config.DAILY_TOKEN_BUDGET },
    ],
  };
  await reserveOperation(reservation, estimatedTokens);
  return reservation;
}

export async function assertChatBudget(userId: string, estimatedTokens = 8_000): Promise<TokenReservation> {
  if (env().GENERATION_ENABLED !== "true") {
    throw new ShadowError("RATE_LIMITED", "AI features are temporarily paused.", true);
  }
  const day = new Date().toISOString().slice(0, 10);
  const reservation = {
    key: `reservation:chat:${userId}:${randomUUID()}:${day}`,
    counters: [{ key: dailyBudgetKey(userId, day), limit: env().DAILY_TOKEN_BUDGET }],
  };
  await reserveOperation(reservation, estimatedTokens);
  return reservation;
}

export async function settleTokenBudget(reservation: TokenReservation, actualTokens: number): Promise<void> {
  if (!Number.isSafeInteger(actualTokens) || actualTokens < 0) throw new Error("Actual token usage must be a non-negative integer.");
  await db().transaction(async (tx) => {
    const [row] = await tx.select({ tokensReserved: tokenBudgets.tokensReserved }).from(tokenBudgets)
      .where(eq(tokenBudgets.key, reservation.key)).for("update");
    if (!row) throw new ShadowError("INTERNAL", "Token reservation could not be reconciled.");
    const delta = actualTokens - row.tokensReserved;
    for (const counter of reservation.counters) await adjustReservedTokens(tx, counter.key, delta);
    await tx.update(tokenBudgets).set({ tokensReserved: actualTokens }).where(eq(tokenBudgets.key, reservation.key));
  });
}

export async function releaseTokenBudget(reservation: TokenReservation): Promise<void> {
  await db().transaction(async (tx) => {
    const [row] = await tx.select({ tokensReserved: tokenBudgets.tokensReserved }).from(tokenBudgets)
      .where(eq(tokenBudgets.key, reservation.key)).for("update");
    if (!row) return;
    await tx.delete(tokenBudgets).where(eq(tokenBudgets.key, reservation.key));
    for (const counter of reservation.counters) await adjustReservedTokens(tx, counter.key, -row.tokensReserved);
  });
}

function dailyBudgetKey(userId: string, day: string): string {
  return `daily:${userId}:${day}`;
}

async function reserveOperation(reservation: TokenReservation, amount: number): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Token estimate must be a non-negative integer.");
  if (reservation.counters.some((counter) => amount > counter.limit)) {
    throw new ShadowError("RATE_LIMITED", "Your AI token budget has been reached.", true);
  }
  await db().transaction(async (tx) => {
    const [inserted] = await tx.insert(tokenBudgets).values({ key: reservation.key, tokensReserved: amount })
      .onConflictDoNothing().returning({ key: tokenBudgets.key });
    if (!inserted) return;
    for (const counter of reservation.counters) await reserveTokens(tx, counter.key, amount, counter.limit);
  });
}

async function reserveTokens(tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0], key: string, amount: number, limit: number) {
  if (amount > limit) throw new ShadowError("RATE_LIMITED", "Your AI token budget has been reached.", true);
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

async function adjustReservedTokens(
  tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
  key: string,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  const [updated] = await tx.update(tokenBudgets)
    .set({ tokensReserved: sql`${tokenBudgets.tokensReserved} + ${delta}` })
    .where(sql`${tokenBudgets.key} = ${key} AND ${tokenBudgets.tokensReserved} + ${delta} >= 0`)
    .returning({ key: tokenBudgets.key });
  if (!updated) throw new ShadowError("INTERNAL", "Token budget counter could not be reconciled.");
}

export function estimateCostMicros(model: string, tokensIn: number, tokensOut: number): number {
  const rates = model.startsWith("gpt-4o-mini") ? { input: 0.15, output: 0.6 } :
    model.startsWith("gpt-4o") ? { input: 2.5, output: 10 } :
      model.startsWith("text-embedding") ? { input: 0.02, output: 0 } : { input: 0.1, output: 0.4 };
  return Math.round(tokensIn * rates.input + tokensOut * rates.output);
}
