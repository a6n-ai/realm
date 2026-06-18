import { AppError } from "@tiffin/commons";
import { json } from "./response";

export function toResponse(err: unknown): Response {
  if (err instanceof AppError) return json({ error: err.message }, err.status);
  console.error(err);
  return json({ error: "Internal Server Error" }, 500);
}
