/** Same-origin relative path for post-login redirects; anything else (protocol-relative, backslash tricks) falls back. */
export function safeNext(next: string | null | undefined, fallback = "/profile"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
