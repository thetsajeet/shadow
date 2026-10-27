import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "shadow" },
  timestamp: pino.stdTimeFunctions.isoTime,
});
