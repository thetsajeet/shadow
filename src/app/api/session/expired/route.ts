import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

/**
 * The GitHub token behind the session was rejected. /sign-in bounces signed-in users straight back,
 * so the session has to be cleared first or the user would loop between the two pages.
 */
export async function GET(req: NextRequest) {
  const target = safeNext(req.nextUrl.searchParams.get("next"));
  const url = new URL("/sign-in", req.url);
  url.searchParams.set("next", target);
  const res = NextResponse.redirect(url);
  try {
    const out = await auth().api.signOut({ headers: req.headers, asResponse: true });
    out.headers.getSetCookie().forEach((c) => res.headers.append("set-cookie", c));
  } catch {
    // Nothing to clear if the session is already gone.
  }
  return res;
}
