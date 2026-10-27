import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { env } from "@/env";

const COOKIE = "shadow_sid";

function sign(id: string) {
  return createHmac("sha256", env().SESSION_SECRET).update(id).digest("base64url");
}

function verify(value: string | undefined): string | null {
  if (!value) return null;
  const [id, sig] = value.split(".");
  if (!id || !sig) return null;
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

/** Returns the anonymous session id, issuing a signed httpOnly cookie when missing/invalid. */
export async function getSessionId(): Promise<string> {
  const jar = await cookies();
  const existing = verify(jar.get(COOKIE)?.value);
  if (existing) return existing;
  const id = randomUUID();
  jar.set(COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
