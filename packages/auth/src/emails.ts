import { renderEmailTemplate, type EmailProvider } from "@realm/email";
import type { Logger } from "@realm/commons/logger";

/**
 * Shared security/account email senders — the single source of truth for every
 * Realm app. Copy lives here; the app injects its provider, brand name, and a
 * logger. These are transactional security emails: they always send (never
 * gated by notification prefs or bounce suppression) and never throw — a mail
 * failure must not break an auth flow, and callers must not leak whether an
 * address exists (reset always "succeeds").
 */
export interface SecurityEmailContext {
  provider: EmailProvider;
  /** Brand name woven into copy, e.g. "Tiffin Grab". */
  appName: string;
  log: Pick<Logger, "debug" | "error">;
}

async function trySend(
  ctx: SecurityEmailContext,
  to: string | null | undefined,
  subject: string,
  body: string,
): Promise<void> {
  if (!to) {
    ctx.log.debug("security email skipped: recipient has no address");
    return;
  }
  try {
    const rendered = await renderEmailTemplate({ subject, body, vars: {} });
    await ctx.provider.send({
      to: { email: to },
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    ctx.log.debug(`security email sent: ${subject}`);
  } catch (err) {
    ctx.log.error({ err }, `security email failed: ${subject}`);
  }
}

/** OTP delivered by the better-auth emailOTP plugin. */
export type OtpType = "forget-password" | "email-verification" | "sign-in" | "change-email";

/** Route an emailOTP code to the right copy by type. */
export function sendOtpEmail(
  ctx: SecurityEmailContext,
  to: string,
  otp: string,
  type: OtpType,
): Promise<void> {
  const { appName } = ctx;
  if (type === "forget-password") {
    return trySend(
      ctx, to,
      `Your ${appName} password reset code`,
      `Your password reset code is **${otp}**.\n\nIt expires in 10 minutes. If you didn't request this, ignore this email — your password is unchanged.`,
    );
  }
  // email-verification also carries change-email confirmation codes.
  return trySend(
    ctx, to,
    `Your ${appName} verification code`,
    `Your verification code is **${otp}**.\n\nIt expires in 10 minutes. If you didn't request this, ignore this email.`,
  );
}

/** Link-based email verification (signup + on-demand resend). */
export function sendWelcomeVerify(ctx: SecurityEmailContext, to: string, url: string): Promise<void> {
  return trySend(
    ctx, to,
    `Verify your ${ctx.appName} email`,
    `Welcome to ${ctx.appName}! Confirm this email address to finish setting up your account.\n\n[Verify email](${url})\n\nIf you didn't create an account, ignore this email.`,
  );
}

/** Security notice after a password reset or change. */
export function sendPasswordChanged(ctx: SecurityEmailContext, to: string): Promise<void> {
  return trySend(
    ctx, to,
    `Your ${ctx.appName} password was changed`,
    `Your ${ctx.appName} account password was just changed. If this was you, no action is needed.\n\nIf you did **not** change it, reset your password immediately and contact support.`,
  );
}

export interface LoginInfo {
  ip?: string | null;
  userAgent?: string | null;
  when: string;
}

/** Alert on a sign-in from a device/IP not seen before. */
export function sendNewLogin(ctx: SecurityEmailContext, to: string, info: LoginInfo): Promise<void> {
  const lines = [
    `A new sign-in to your ${ctx.appName} account was detected.`,
    "",
    `- When: ${info.when}`,
    info.ip ? `- IP: ${info.ip}` : "",
    info.userAgent ? `- Device: ${info.userAgent}` : "",
    "",
    "If this was you, no action is needed. If not, reset your password immediately.",
  ].filter((l) => l !== "");
  return trySend(ctx, to, `New sign-in to your ${ctx.appName} account`, lines.join("\n"));
}
