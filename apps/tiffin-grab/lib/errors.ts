import { AppError, ValidationError } from "@foundry/commons";

/** The row changed or already exists (stale edit, duplicate key); the caller should reload or rename. */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

/**
 * A refused pick that names WHICH rule refused it.
 *
 * Subclasses ValidationError so every existing handler keeps treating it as a
 * 400 with a message; only the meal actions look at `rulePublicId`, to highlight
 * that rule in the list already shown in the picker.
 */
export class MealRuleViolationError extends ValidationError {
  constructor(
    message: string,
    readonly rulePublicId: string,
  ) {
    super(message);
  }
}
