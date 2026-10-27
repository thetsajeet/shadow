import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";
import { env } from "@/env";

function create() {
  const e = env();
  return betterAuth({
    baseURL: e.BETTER_AUTH_URL,
    secret: e.SESSION_SECRET,
    database: drizzleAdapter(db(), { provider: "pg", schema }),
    // GitHub is the only way in: no email/password, no phone.
    emailAndPassword: { enabled: false },
    socialProviders: {
      github: {
        clientId: e.GITHUB_CLIENT_ID,
        clientSecret: e.GITHUB_CLIENT_SECRET,
        scope: e.GITHUB_OAUTH_SCOPES.split(",").map((s) => s.trim()).filter(Boolean),
        mapProfileToUser: (profile) => ({ githubLogin: profile.login, githubId: String(profile.id) }),
      },
    },
    user: {
      additionalFields: {
        githubLogin: { type: "string", required: true, input: false },
        githubId: { type: "string", required: true, input: false },
      },
    },
    account: { encryptOAuthTokens: true },
    session: { expiresIn: 60 * 60 * 24 * 14, cookieCache: { enabled: true, maxAge: 5 * 60 } },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof create>;
const g = globalThis as unknown as { __shadowAuth?: Auth };

/** Lazily constructed so `next build` works without secrets. */
export function auth(): Auth {
  g.__shadowAuth ??= create();
  return g.__shadowAuth;
}
