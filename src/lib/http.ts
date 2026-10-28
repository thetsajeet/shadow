import { NextResponse } from "next/server";
import { ShadowError, toShadowError, type ErrorCode } from "./errors";
import { logger } from "./logger";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_URL: 400,
  NOT_FOUND: 404,
  PRIVATE: 404,
  TOO_LARGE: 422,
  RATE_LIMITED: 503,
  INGEST_FAILED: 502,
  LLM_ERROR: 502,
  BUSY: 409,
  TIMEOUT: 504,
  INTERNAL: 500,
};

export function errorResponse(e: unknown, context: string) {
  const err = toShadowError(e);
  if (!(e instanceof ShadowError)) logger.error({ err: e }, `${context} failed`);
  return NextResponse.json({ error: err.message, code: err.code }, { status: STATUS[err.code] });
}
