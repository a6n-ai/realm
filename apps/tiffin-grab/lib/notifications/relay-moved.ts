import { ValidationError } from "@foundry/commons";
import { problem } from "@foundry/routes";
import { emailViaRelay } from "@/lib/runtime/env";

export const CAMPAIGNS_MOVED = "campaigns moved to Relay";

/** Under the flag, Relay's console owns campaigns; the engine refuses to create or send them. */
export function campaignsMovedResponse(): Response | null {
  return emailViaRelay() ? problem(409, CAMPAIGNS_MOVED) : null;
}

export function assertCampaignsOnEngine(): void {
  if (emailViaRelay()) throw new ValidationError(CAMPAIGNS_MOVED);
}
