import { describe, expect, it } from "vitest";
import { canManage, canView } from "../access";

const pub = { visibility: "public", ownerUserId: "o" } as const;
const priv = { visibility: "private", ownerUserId: "o" } as const;

describe("access matrix", () => {
  it("public: anyone views, only owner manages", () => {
    expect(canView(pub, null)).toBe(true);
    expect(canView(pub, { id: "x" })).toBe(true);
    expect(canManage(pub, null)).toBe(false);
    expect(canManage(pub, { id: "x" })).toBe(false);
    expect(canManage(pub, { id: "o" })).toBe(true);
  });
  it("private: only owner views and manages", () => {
    expect(canView(priv, null)).toBe(false);
    expect(canView(priv, { id: "x" })).toBe(false);
    expect(canView(priv, { id: "o" })).toBe(true);
    expect(canManage(priv, { id: "o" })).toBe(true);
  });
  it("unowned repos are never manageable", () => {
    expect(canManage({ visibility: "public", ownerUserId: null }, { id: "o" })).toBe(false);
  });
});
