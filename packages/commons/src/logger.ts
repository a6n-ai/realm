import pino, { type Logger } from "pino";

// Structured JSON to stdout. On EC2/Docker the awslogs driver ships stdout to
// CloudWatch; Logs Insights parses these JSON fields (level, name, msg, ...).
// Local: pipe to pino-pretty (see root dev script). No pino `transport` — its
// worker thread does not survive Next's server bundling.
export const loggerOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  // string level ("info") is more queryable in CloudWatch than pino's numeric default (30)
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: [
      "password", "*.password",
      "pin", "*.pin",
      "token", "*.token",
      "secret", "*.secret",
      "authorization", "*.authorization",
      "cookie", "*.cookie",
    ],
    censor: "[redacted]",
  },
};

const root = pino(loggerOptions);

export function createLogger(name: string, bindings?: Record<string, unknown>): Logger {
  return root.child({ name, ...bindings });
}

export type { Logger };
