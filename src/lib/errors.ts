export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_URL"
  | "NOT_FOUND"
  | "PRIVATE"
  | "TOO_LARGE"
  | "RATE_LIMITED"
  | "INGEST_FAILED"
  | "LLM_ERROR"
  | "BUSY"
  | "TIMEOUT"
  | "INTERNAL";

export class ShadowError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retriable = false,
  ) {
    super(message);
    this.name = "ShadowError";
  }
}

export function toShadowError(e: unknown): ShadowError {
  if (e instanceof ShadowError) return e;
  return new ShadowError("INTERNAL", e instanceof Error ? e.message : "Unknown error");
}
