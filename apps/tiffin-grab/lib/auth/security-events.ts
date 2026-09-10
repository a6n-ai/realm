import { and, eq } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import {
  type OtpType,
  type SecurityEmailContext,
  sendNewLogin,
  sendDeleteVerification,
  sendOtpEmail,
  sendPasswordChanged,
} from "@foundry/auth";
import { db } from "@/db/client";
import { session as sessionTable } from "@/db/schema";
import { getEmailProvider } from "@/lib/email/provider";
import { enqueueNotification } from "@/lib/notifications/enqueue";

const log = createLogger("auth-security");
const APP_NAME = "Tiffin Grab";

function ctx(): SecurityEmailContext {
  return { provider: getEmailProvider(), appName: APP_NAME, log };
}

/** emailOTP plugin callback: deliver a reset/verify/sign-in code via SES. */
export function sendAuthOtp(email: string, otp: string, type: OtpType): Promise<void> {
  return sendOtpEmail(ctx(), email, otp, type);
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
export function sendDeleteVerify(user: { email?: string | null }, url: string): Promise<void> {
  return user.email ? sendDeleteVerification(ctx(), user.email, url) : Promise.resolve();
}

/** Security alert after a password reset or change. */
export function notifyPasswordChanged(email: string | null | undefined): Promise<void> {
  return email ? sendPasswordChanged(ctx(), email) : Promise.resolve();
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

  await sendNewLogin(ctx(), email, {
    ip,
    userAgent: params.userAgent,
    when: new Date().toISOString(),
  });
}
