import { type OtpType } from "@foundry/auth";
import { createLogger } from "@foundry/commons/logger";
import { SITE_NAME } from "@/lib/brand";
import { getEmailProvider } from "@/lib/email/provider";

const log = createLogger("auth-otp");

export async function sendAuthOtp(email: string, otp: string, type: OtpType): Promise<void> {
  const subject = type === "forget-password" ? `Reset your ${SITE_NAME} password` : `Your ${SITE_NAME} sign-in code`;
  const text = `Your code is ${otp}. It expires in 10 minutes.`;

  if (process.env.NODE_ENV !== "production") {
    log.info({ email, type, otp }, "auth otp (dev)");
  }

  try {
    await getEmailProvider().send({
      to: { email },
      subject,
      text,
      html: `<p>Your code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
    });
  } catch (e) {
    log.error({ err: e, email, type }, "auth otp send failed");
    if (process.env.NODE_ENV === "production") throw e;
  }
}

/** Branded invite email for the organization plugin's staff-invite flow. */
export async function sendStaffInvitation(input: { email: string; role: string; inviteUrl: string }): Promise<void> {
  const subject = `You've been invited to ${SITE_NAME}`;
  const text = `You've been invited to join the ${SITE_NAME} team as ${input.role}. Accept your invitation: ${input.inviteUrl}\n\nThis invite expires in 7 days.`;
  const html = `<p>You've been invited to join the ${SITE_NAME} team as <strong>${input.role}</strong>.</p><p><a href="${input.inviteUrl}">Accept invitation</a></p><p>This invite expires in 7 days.</p>`;

  if (process.env.NODE_ENV !== "production") {
    log.info({ email: input.email, role: input.role, inviteUrl: input.inviteUrl }, "staff invitation (dev)");
  }

  try {
    await getEmailProvider().send({ to: { email: input.email }, subject, text, html });
  } catch (e) {
    log.error({ err: e, email: input.email }, "staff invitation send failed");
    if (process.env.NODE_ENV === "production") throw e;
  }
}
