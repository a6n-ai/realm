import { AppError } from "@foundry/commons";

/** The row changed or already exists (stale edit, duplicate key); the caller should reload or rename. */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}
