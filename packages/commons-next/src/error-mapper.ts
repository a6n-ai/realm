import { AppError } from "@realm/commons";
import { createLogger } from "@realm/commons/logger";
import { json } from "./response";

const log = createLogger("error-mapper");

export function toResponse(err: unknown): Response {
  if (err instanceof AppError) return json({ error: err.message }, err.status);
  log.error({ err }, "unhandled error");
  return json({ error: "Internal Server Error" }, 500);
}
