import { renderEmailTemplate } from "@realm/email";
import { createLogger } from "@realm/commons/logger";
import { getEmailProvider } from "@/lib/email/provider";

const log = createLogger("auth-email");

// ponytail: auth transactional copy lives inline here, NOT in the DB
// notification-template system — those are admin-authored marketing/ops
// templates, a different concern. Two short strings don't need a table.
const RESET_SUBJECT = "Reset your Tiffin Grab password";
const RESET_BODY = [
  "You asked to reset your Tiffin Grab password.",
  "",
  "[Reset your password]({{url}})",
  "",
  "This link expires in 1 hour. If you didn't ask for this, ignore this email — your password stays the same.",
].join("\n");

const VERIFY_SUBJECT = "Verify your Tiffin Grab email";
const VERIFY_BODY = [
  "Confirm this email address to finish setting up your Tiffin Grab account.",
  "",
  "[Verify email]({{url}})",
  "",
  "If you didn't create an account, ignore this email.",
].join("\n");

type Recipient = { email?: string | null; id: string };

async function send(to: string, subject: string, body: string, url: string): Promise<void> {
  const rendered = await renderEmailTemplate({ subject, body, vars: { url } });
  await getEmailProvider().send({
    to: { email: to },
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

/**
 * Auth callbacks must not throw: a mail failure can't break sign-up or leak
 * whether an address exists (password reset always returns 200). Missing email
 * (customers are phone-first) is a silent skip.
 */
async function trySend(kind: string, user: Recipient, subject: string, body: string, url: string): Promise<void> {
  if (!user.email) {
    log.debug(`${kind}: user ${user.id} has no email — skip`);
    return;
  }
  try {
    await send(user.email, subject, body, url);
    log.debug(`${kind} sent to ${user.email}`);
  } catch (err) {
    log.error({ err }, `${kind} failed for ${user.email}`);
  }
}

export function sendPasswordResetEmail(user: Recipient, url: string): Promise<void> {
  return trySend("password reset", user, RESET_SUBJECT, RESET_BODY, url);
}

export function sendVerificationEmail(user: Recipient, url: string): Promise<void> {
  return trySend("verify email", user, VERIFY_SUBJECT, VERIFY_BODY, url);
}
