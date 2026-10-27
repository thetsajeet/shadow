import { NonRetriableError } from "inngest";
import { describe, expect, it } from "vitest";
import { ShadowError } from "../errors";
import { decodeError, guard } from "../errors-codec";
import { normalizeOutline } from "../pipeline/plan";

describe("normalizeOutline", () => {
  it("drops unknown files, sanitizes and dedupes slugs, caps pages", () => {
    const out = normalizeOutline(
      [
        { slug: "Over View!", title: "A", summary: "", files: ["a.ts", "ghost.ts", "a.ts"] },
        { slug: "over-view", title: "B", summary: "", files: [] },
        ...Array.from({ length: 20 }, (_, i) => ({ slug: `p${i}`, title: "x", summary: "", files: [] })),
      ],
      ["a.ts"],
    );
    expect(out[0]).toMatchObject({ slug: "over-view", files: ["a.ts"] });
    expect(out[1].slug).toBe("over-view-2");
    expect(out).toHaveLength(14);
  });
});

describe("error codec", () => {
  it("makes permanent errors non-retriable and keeps the code", async () => {
    const err = await guard(async () => {
      throw new ShadowError("TOO_LARGE", "big");
    }).catch((e) => e);
    expect(err).toBeInstanceOf(NonRetriableError);
    expect(decodeError(err)).toEqual({ code: "TOO_LARGE", message: "big" });
  });
  it("keeps retriable errors retriable", async () => {
    const err = await guard(async () => {
      throw new ShadowError("RATE_LIMITED", "slow down", true);
    }).catch((e) => e);
    expect(err).not.toBeInstanceOf(NonRetriableError);
    expect(decodeError(err).code).toBe("RATE_LIMITED");
  });
  it("falls back to INTERNAL / TIMEOUT", () => {
    expect(decodeError(new Error("boom")).code).toBe("INTERNAL");
    expect(decodeError(new Error("request timed out")).code).toBe("TIMEOUT");
  });
});
