import { type OtpType } from "@foundry/auth";
import { db } from "@/db/client";
import { enqueueNotification } from "@/lib/notifications/enqueue";

const APP_NAME = "Puchkaman";

/**
 * emailOTP plugin callback: deliver a reset/verify/sign-in code. Migrated
 * (2026-09) off @foundry/auth's direct-send path onto the notification
 * pipeline — enqueue() writes a durable outbox row before anything is sent,
 * drained by the fast (~1s) drainer, so this stays effectively as instant as
 * the direct call was. "sign-in" and "change-email" share the generic
 * verification-code copy with "email-verification", same as the original
 * direct-send routing (only forget-password had distinct copy).
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
