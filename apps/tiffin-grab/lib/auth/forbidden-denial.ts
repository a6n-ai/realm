import { ForbiddenError } from "@foundry/commons";

/** Only a permission denial gets the no-access page. A missing session (AuthError) still goes to login. */
export function isForbiddenDenial(error: unknown): boolean {
  return error instanceof ForbiddenError;
}
