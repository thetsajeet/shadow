import { NonRetriableError } from "inngest";
import { ShadowError, type ErrorCode } from "./errors";

const PREFIX = /^([A-Z_]+): ([\s\S]*)$/;

/** Wraps a step body: permanent ShadowErrors stop retries; the code travels in the message. */
export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ShadowError) {
      const msg = `${e.code}: ${e.message}`;
      throw e.retriable ? new Error(msg) : new NonRetriableError(msg);
    }
    throw e;
  }
}

export function decodeError(e: unknown): { code: ErrorCode; message: string } {
  const raw = e instanceof Error ? e.message : String(e);
  const m = PREFIX.exec(raw);
  if (m) return { code: m[1] as ErrorCode, message: m[2] };
  if (/timed? ?out/i.test(raw)) return { code: "TIMEOUT", message: raw };
  return { code: "INTERNAL", message: raw };
}
