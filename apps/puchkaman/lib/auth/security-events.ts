import { createLogger } from "@realm/commons/logger";
import { type OtpType, type SecurityEmailContext, sendOtpEmail } from "@realm/auth";
import { getEmailProvider } from "@/lib/email/provider";

const log = createLogger("auth-security");
const APP_NAME = "Puchkaman";

function ctx(): SecurityEmailContext {
  return { provider: getEmailProvider(), appName: APP_NAME, log };
}

/** emailOTP plugin callback: deliver a reset/verify/sign-in code via SES. */
export function sendAuthOtp(email: string, otp: string, type: OtpType): Promise<void> {
  return sendOtpEmail(ctx(), email, otp, type);
}
