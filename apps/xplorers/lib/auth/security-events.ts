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
