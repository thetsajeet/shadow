import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let signOutImpl: () => Promise<Response> = async () => new Response(null);
const signOut = { mockResolvedValue: (r: Response) => void (signOutImpl = async () => r), mockReset: () => void (signOutImpl = async () => new Response(null)) };
vi.mock("@/lib/auth", () => ({ auth: () => ({ api: { signOut: () => signOutImpl() } }) }));

import { GET } from "@/app/api/session/expired/route";
import { ShadowError } from "../errors";
import { mapError } from "../github";
import { fetchProfile } from "../github-user";

describe("mapError", () => {
  it("maps 401 to a non-retriable UNAUTHENTICATED", () => {
    const e = mapError(Object.assign(new Error("Bad credentials"), { status: 401 }), "reading your GitHub profile");
    expect(e).toBeInstanceOf(ShadowError);
    expect(e.code).toBe("UNAUTHENTICATED");
    expect(e.retriable).toBe(false);
  });
  it("keeps existing mappings", () => {
    expect(mapError({ status: 404 }, "x").code).toBe("NOT_FOUND");
    expect(mapError({ status: 403 }, "x").code).toBe("RATE_LIMITED");
    expect(mapError({ status: 429 }, "x").code).toBe("RATE_LIMITED");
    expect(mapError({ status: 502 }, "x")).toMatchObject({ code: "INGEST_FAILED", retriable: true });
    expect(mapError(new Error("boom"), "x")).toMatchObject({ code: "INGEST_FAILED", retriable: false });
  });
});

describe("fetchProfile with a rejected token", () => {
  it("throws UNAUTHENTICATED on a real 401 from GitHub", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchProfile("ghu_expired")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    vi.unstubAllGlobals();
  });
});

describe("GET /api/session/expired", () => {
  beforeEach(() => signOut.mockReset());

  const call = (qs = "") => GET(new NextRequest(`http://localhost:3000/api/session/expired${qs}`));

  it("clears the session cookies and redirects to sign-in", async () => {
    const headers = new Headers();
    headers.append("set-cookie", "better-auth.session_token=; Max-Age=0; Path=/");
    signOut.mockResolvedValue(new Response(null, { headers }));
    const res = await call("?next=/profile");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/sign-in?next=%2Fprofile");
    expect(res.headers.get("set-cookie")).toContain("better-auth.session_token=;");
  });

  it("rejects external redirect targets", async () => {
    signOut.mockResolvedValue(new Response(null));
    for (const next of ["//evil.com", "https://evil.com", "/\\evil.com"]) {
      const res = await call(`?next=${encodeURIComponent(next)}`);
      expect(res.headers.get("location")).toBe("http://localhost:3000/sign-in?next=%2Fprofile");
    }
  });

  it("still redirects when sign-out throws", async () => {
    signOutImpl = async () => {
      throw new Error("no session");
    };
    const res = await call();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/sign-in");
  });
});
