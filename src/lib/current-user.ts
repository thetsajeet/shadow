import { headers } from "next/headers";
import { auth } from "./auth";
import { ShadowError } from "./errors";

export interface CurrentUser {
  id: string;
  name: string;
  image: string | null;
  githubLogin: string;
  githubId: string;
}

/** Signed-in user from the session cookie, or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const s = await auth().api.getSession({ headers: await headers() });
  if (!s) return null;
  const u = s.user as typeof s.user & { githubLogin?: string; githubId?: string };
  return { id: u.id, name: u.name, image: u.image ?? null, githubLogin: u.githubLogin ?? u.name, githubId: u.githubId ?? "" };
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new ShadowError("UNAUTHENTICATED", "Please sign in with GitHub.");
  return u;
}
