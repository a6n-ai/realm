import { and, eq } from "drizzle-orm";
import { type OtpType } from "@foundry/auth";
import { db } from "@/db/client";
import { session as sessionTable } from "@/db/schema";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { linkCapture } from "./link-capture";

const APP_NAME = "Tiffin Grab";

/**
 * emailOTP plugin callback: deliver a reset/verify/sign-in code. Migrated
 * (2026-09) off @foundry/auth's direct-send path onto the notification
 * pipeline — see sendVerification below for why. "sign-in" and "change-email"
 * share the generic verification-code copy with "email-verification", same
 * as the original direct-send routing.
 */
export async function sendAuthOtp(email: string, otp: string, type: OtpType): Promise<void> {
  const event = type === "forget-password" ? "email_otp_password_reset" : "email_otp_verification";
  await db.transaction((tx) =>
    enqueueNotification(tx, {
      event,
      recipientEmail: email,
      title: `Your ${APP_NAME} verification code`,
      body: "",
      data: { otp },
      channels: ["email"],
      kind: "transactional",
      // Scoped by the code itself (fresh per request) — only guards an
      // accidental double-invoke of the same code, never blocks a new one.
      dedupeKey: `${event}:${email.toLowerCase()}:${otp}`,
    }),
  );
}

/**
 * Link-based email verification (signup + on-demand resend). Migrated off the
 * direct-send path (2026-09) onto the notification pipeline — enqueue() writes
 * a durable outbox row before anything is sent, and the fast drainer picks it
 * up within ~1s, so this stays effectively as instant as the direct call was.
 * Explicit recipientEmail (not recipientId → DB lookup): better-auth may be
 * reverifying an address not yet the user's committed `users.email`.
 */
export async function sendVerification(user: { email?: string | null }, url: string): Promise<void> {
  if (!user.email) return;
  await db.transaction((tx) =>
    enqueueNotification(tx, {
      event: "email_verification_link",
      recipientEmail: user.email!,
      title: `Verify your ${APP_NAME} email`,
      body: "",
      data: { url },
      channels: ["email"],
      kind: "transactional",
      // Scoped by url (a fresh token each call, including a resend) so this
      // only dedupes an accidental double-invoke of the same token — a
      // genuine resend gets a new token and so always queues its own row.
      dedupeKey: `email_verification_link:${user.email!.toLowerCase()}:${url}`,
    }),
  );
}

/**
 * Branded invite email for the organization plugin's staff-invite flow.
 * `sendKey` must change per real send: better-auth's resend reuses the same
 * invitation id (only expiresAt moves), and a key of just the email made every
 * resend collide with the first outbox row and silently send nothing.
 */
export async function sendStaffInvitation(input: {
  email: string;
  role: string;
  inviteUrl: string;
  sendKey: string;
}): Promise<void> {
  await db.transaction((tx) =>
    enqueueNotification(tx, {
      event: "staff_invitation",
      recipientEmail: input.email,
      title: `You've been invited to ${APP_NAME}`,
      // Used only when the staff_invitation template row is missing (templates
      // are seeded by hand; prod had none as of 2026-09-27) — an empty body
      // mailed an invite with no link.
      body: `You've been invited to join the ${APP_NAME} team as ${input.role}. Accept here (the link signs you in): ${input.inviteUrl}`,
      data: { role: input.role, inviteUrl: input.inviteUrl },
      channels: ["email"],
      kind: "transactional",
      dedupeKey: `staff_invitation:${input.email.toLowerCase()}:${input.sendKey}`,
    }),
  );
}

export type PaymentReminderVars = { amount: string; orderCode: string; customerName: string };

export type InviteLinkMetadata =
  | { kind: "staff_invite"; role: string }
  | { kind: "customer_invite" }
  | { kind: "payment_reminder"; payment: PaymentReminderVars };

/**
 * magicLink plugin callback. Links are only ever issued by lib/auth/invite-links
 * (the public route is disabled), so anything without our metadata is refused
 * rather than mailed with made-up copy. The url carries a fresh single-use
 * token, so it doubles as the dedupe key: only an accidental double-invoke of
 * the same link collapses.
 */
export async function sendInviteLinkEmail(email: string, url: string, metadata: unknown): Promise<void> {
  const meta = metadata as InviteLinkMetadata | undefined;
  const capture = linkCapture.getStore();
  if (capture) {
    capture.url = url;
    return;
  }
  if (meta?.kind === "staff_invite") {
    return sendStaffInvitation({ email, role: meta.role, inviteUrl: url, sendKey: url });
  }
  if (meta?.kind === "customer_invite") {
    await db.transaction((tx) =>
      enqueueNotification(tx, {
        event: "customer_invitation",
        recipientEmail: email,
        title: `Welcome to ${APP_NAME}`,
        // Used only if the customer_invitation template row is missing (templates
        // are seeded by hand) — an empty body would mail a welcome with no link.
        body: `Your ${APP_NAME} account is ready. Open it here (the link signs you in and works once, for 7 days): ${url}`,
        data: { url },
        channels: ["email"],
        kind: "transactional",
        dedupeKey: `customer_invitation:${email.toLowerCase()}:${url}`,
      }),
    );
    return;
  }
  if (meta?.kind === "payment_reminder") {
    await db.transaction((tx) =>
      enqueueNotification(tx, {
        event: "payment_reminder",
        recipientEmail: email,
        title: `Payment pending for your ${APP_NAME} order`,
        body: `Your payment of ${meta.payment.amount} is still pending. Sign in and upload your payment screenshot: ${url}`,
        data: { payment: { ...meta.payment, url } },
        channels: ["email"],
        kind: "transactional",
        dedupeKey: `payment_reminder:${email.toLowerCase()}:${url}`,
      }),
    );
    return;
  }
  throw new Error("magic link requested without invite metadata");
}

/** Confirm-link for account deletion (OAuth / no-password paths). */
export async function sendDeleteVerify(user: { email?: string | null }, url: string): Promise<void> {
  if (!user.email) return;
  await db.transaction((tx) =>
    enqueueNotification(tx, {
      event: "account_deletion_confirm",
      recipientEmail: user.email!,
      title: `Confirm deleting your ${APP_NAME} account`,
      body: "",
      data: { url },
      channels: ["email"],
      kind: "transactional",
      dedupeKey: `account_deletion_confirm:${user.email!.toLowerCase()}:${url}`,
    }),
  );
}

/** Security alert after a password reset or change. */
export async function notifyPasswordChanged(email: string | null | undefined): Promise<void> {
  if (!email) return;
  await db.transaction((tx) =>
    enqueueNotification(tx, {
      event: "password_changed",
      recipientEmail: email,
      title: `Your ${APP_NAME} password was changed`,
      body: "",
      data: {},
      channels: ["email"],
      kind: "transactional",
    }),
  );
}

/**
 * Email a "new sign-in" alert only when this login's IP hasn't been seen for the
 * user before. The just-created session already carries this IP, so a genuinely
 * new device yields exactly one matching session; a returning device yields more.
 * No IP → can't decide → skip.
 */
export async function notifyNewLoginIfNewDevice(params: {
  userId: string;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const { email, ip } = params;
  if (!email || !ip) return;

  const priorSameIp = await db
    .select({ id: sessionTable.id })
    .from(sessionTable)
    .where(and(eq(sessionTable.userId, BigInt(params.userId)), eq(sessionTable.ipAddress, ip)))
    .limit(2);
  if (priorSameIp.length > 1) return; // returning device

  await db.transaction((tx) =>
    enqueueNotification(tx, {
      event: "new_login_alert",
      recipientEmail: email,
      title: `New sign-in to your ${APP_NAME} account`,
      body: "",
      data: { when: new Date().toISOString(), ip, userAgent: params.userAgent ?? "" },
      channels: ["email"],
      kind: "transactional",
    }),
  );
}
