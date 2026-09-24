import { ValidationError } from "@foundry/commons";

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
