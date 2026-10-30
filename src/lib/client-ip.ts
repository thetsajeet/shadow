import { headers } from "next/headers";

export function getTrustedClientIp(h: Headers): string {
  return h.get("x-real-ip")?.trim() || "unknown";
}

export async function getClientIp(): Promise<string> {
  return getTrustedClientIp(await headers());
}
