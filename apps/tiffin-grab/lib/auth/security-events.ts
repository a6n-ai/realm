import { and, eq } from "drizzle-orm";
import { type OtpType } from "@foundry/auth";
import { db } from "@/db/client";
import { session as sessionTable } from "@/db/schema";
import { enqueueNotification } from "@/lib/notifications/enqueue";

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
