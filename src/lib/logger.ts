import pino from "pino";

const redactText = (value: string) => value
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9_-]{20,})\b/g, "[REDACTED]")
  .replace(/((?:api[_-]?key|access[_-]?token|secret|password|passwd|client[_-]?secret)\s*[:=]\s*["']?)[^\s"',;]+/gi, "$1[REDACTED]");

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "shadow" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ["req.headers.authorization", "*.accessToken", "*.refreshToken", "*.apiKey", "*.secret", "*.token", "*.password"],
    censor: "[REDACTED]",
  },
  serializers: {
    err: (value) => {
      const error = pino.stdSerializers.err(value);
      if (!error || typeof error !== "object") return error;
      const serialized = error as Record<string, unknown>;
      return {
        ...serialized,
        message: typeof serialized.message === "string" ? redactText(serialized.message) : serialized.message,
        stack: typeof serialized.stack === "string" ? redactText(serialized.stack) : serialized.stack,
      };
    },
  },
});
