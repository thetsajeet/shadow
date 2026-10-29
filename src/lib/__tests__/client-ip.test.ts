import { describe, expect, it } from "vitest";
import { getTrustedClientIp } from "../client-ip";

describe("trusted client IP", () => {
  it("uses only the proxy-overwritten x-real-ip header", () => {
    const headers = new Headers({
      "x-real-ip": "203.0.113.8",
      "cf-connecting-ip": "198.51.100.10",
      "x-forwarded-for": "192.0.2.1, 192.0.2.2",
    });
    expect(getTrustedClientIp(headers)).toBe("203.0.113.8");
  });

  it("does not accept client-controlled forwarding headers as a fallback", () => {
    const headers = new Headers({
      "cf-connecting-ip": "198.51.100.10",
      "x-forwarded-for": "192.0.2.1",
    });
    expect(getTrustedClientIp(headers)).toBe("unknown");
  });
});
