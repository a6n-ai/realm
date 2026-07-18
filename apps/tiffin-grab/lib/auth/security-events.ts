import { and, eq } from "drizzle-orm";
import { createLogger } from "@realm/commons/logger";
import {
  type OtpType,
  type SecurityEmailContext,
  sendNewLogin,
  sendOtpEmail,
  sendPasswordChanged,
  sendWelcomeVerify,
} from "@realm/auth";
import { db } from "@/db/client";
import { session as sessionTable } from "@/db/schema";
import { getEmailProvider } from "@/lib/email/provider";

const log = createLogger("auth-security");
const APP_NAME = "Tiffin Grab";

function ctx(): SecurityEmailContext {
  return { provider: getEmailProvider(), appName: APP_NAME, log };
}

/** emailOTP plugin callback: deliver a reset/verify/sign-in code via SES. */
export function sendAuthOtp(email: string, otp: string, type: OtpType): Promise<void> {
  return sendOtpEmail(ctx(), email, otp, type);
}

/** Link-based email verification (signup + on-demand resend). */
export function sendVerification(user: { email?: string | null }, url: string): Promise<void> {
  return user.email ? sendWelcomeVerify(ctx(), user.email, url) : Promise.resolve();
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
