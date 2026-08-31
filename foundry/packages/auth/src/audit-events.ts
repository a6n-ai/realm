/**
 * Auth audit vocabulary, shared by every client app.
 *
 * Deliberately NOT better-auth's `dash()` plugin: that is part of Better Auth
 * Infrastructure, a hosted dashboard that ships auth events (emails, IPs) to a
 * third party, and its admin-facing query needs the organization plugin neither
 * app uses. We keep the event taxonomy and record it in our own append-only
 * audit_log through each app's existing recordAudit.
 *
 * The names below mirror the plugin's so the two stay comparable if we ever do
 * adopt it. They travel in `changes._action`, the convention the audit-describe
 * tables already use — the audit_operation pg enum stays untouched, so no
 * migration is needed to add an event.
 */

/** Endpoint path → event name. Null means "not worth an audit row". */
export function authAuditAction(path: string): string | null {
  switch (path) {
    case "/sign-up/email":
      return "user_signed_up";
    case "/change-password":
      return "password_changed";
    case "/email-otp/reset-password":
    case "/reset-password":
      return "password_reset_completed";
    case "/email-otp/request-password-reset":
    case "/request-password-reset":
    case "/forget-password":
      return "password_reset_requested";
    case "/verify-email":
    case "/email-otp/verify-email":
      return "email_verified";
    case "/change-email":
    case "/email-otp/request-email-change":
      return "email_change_requested";
    case "/revoke-session":
      return "session_revoked";
    case "/revoke-sessions":
    case "/revoke-other-sessions":
      return "sessions_revoked_all";
    case "/delete-user":
      return "user_deleted";
    default:
      return null;
  }
}

/** Human labels for the admin activity log. */
export const AUTH_AUDIT_LABELS: Record<string, string> = {
  user_signed_up: "Signed up",
  password_changed: "Changed password",
  password_reset_requested: "Requested a password reset",
  password_reset_completed: "Completed a password reset",
  email_verified: "Verified email address",
  email_change_requested: "Requested an email change",
  session_revoked: "Revoked a session",
  sessions_revoked_all: "Revoked all other sessions",
  user_deleted: "Deleted their account",
};
