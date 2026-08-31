import { AppError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { problem } from "./response";

const log = createLogger("error-mapper");

export function toResponse(err: unknown): Response {
  if (err instanceof AppError) return problem(err.status, err.message);
  log.error({ err }, "unhandled error");
  return problem(500, "Internal Server Error");
}
