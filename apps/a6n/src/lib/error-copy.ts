import { createErrorText } from "@foundry/console/error-text";

export const { errorText, reasonText } = createErrorText({
  forbidden: "You do not have access to do that.",
  unauthorized: "Your session ended. Sign in again.",
  "cross-origin write": "That request was blocked. Reload the page and try again.",
  invalid: "Check the details and try again.",
  stale: "Changed by someone else. Reload and try again.",
  already_claimed: "Someone else already took this inquiry.",
  inactive_source: "That source is no longer active. Pick another.",
  password_exists: "This account already has a password. Change it from Account.",
  not_found: "That record no longer exists.",
  "not found": "That record no longer exists.",
  mail_unavailable: "Mail is not available right now.",
  bad_origin: "That request was blocked. Reload the page and try again.",
  already_active: "That person is already on the team.",
  last_admin: "You cannot remove the last admin.",
  self: "You cannot remove yourself.",
  already_removed: "That person is already removed.",
});
