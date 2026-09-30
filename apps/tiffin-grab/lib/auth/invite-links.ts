import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { InviteLinkMetadata, PaymentReminderVars } from "./security-events";

// The only issuers of magic links (the public /sign-in/magic-link route is
// disabled in lib/auth). Each link signs the invitee in on click; where it
// lands decides the rest of the setup.
async function issue(email: string, callbackURL: string, errorCallbackURL: string, metadata: InviteLinkMetadata) {
  await auth.api.signInMagicLink({
    body: { email, callbackURL, errorCallbackURL, metadata },
    headers: await headers(),
  });
}

/** Staff invitation: sign in, accept the org invitation, then choose a password. */
export function sendStaffInviteLink(input: { email: string; role: string; invitationId: string }) {
  return issue(
    input.email,
    `/accept-invitation/${input.invitationId}/complete`,
    // Expired/used link: the accept page's email-code form still works.
    `/accept-invitation/${input.invitationId}`,
    { kind: "staff_invite", role: input.role },
  );
}

/** Staff who already joined but never set a password: sign in, then /set-password. */
export function sendStaffSetupLink(input: { email: string; role: string }) {
  return issue(input.email, "/set-password", "/login", { kind: "staff_invite", role: input.role });
}

/** Customer welcome: sign in straight to /me. Email code is their sign-in; no password needed. */
export function sendCustomerInviteLink(email: string) {
  return issue(email, "/me", "/login", { kind: "customer_invite" });
}

/** Unpaid manual payment: sign in straight to Finances → Bills to upload the screenshot. */
export function sendPaymentReminderLink(email: string, payment: PaymentReminderVars) {
  return issue(email, "/me/wallet?tab=bills", "/login", { kind: "payment_reminder", payment });
}
