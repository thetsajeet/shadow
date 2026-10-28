import { and, eq } from "drizzle-orm";
import { symmetricDecrypt } from "better-auth/crypto";
import { db } from "@/db";
import { account } from "@/db/schema";
import { auth } from "./auth";
import { ShadowError } from "./errors";

/** Decrypted GitHub OAuth token for a user; usable outside a request (e.g. inside Inngest steps). */
export async function getUserGithubToken(userId: string): Promise<string> {
  const [row] = await db()
    .select({ token: account.accessToken })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "github")));
  if (!row?.token) throw new ShadowError("UNAUTHENTICATED", "GitHub authorization is missing. Please sign in again.");
  const ctx = await auth().$context;
  try {
    return /^[0-9a-f]+$/i.test(row.token) && row.token.length % 2 === 0
      ? await symmetricDecrypt({ key: ctx.secretConfig, data: row.token })
      : row.token;
  } catch {
    throw new ShadowError("UNAUTHENTICATED", "Could not read GitHub authorization. Please sign in again.");
  }
}
