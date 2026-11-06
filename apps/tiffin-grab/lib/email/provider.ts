import { type EmailProvider, type EmailStream, SesEmailProvider } from "@relay/email";

let transactional: EmailProvider | undefined;
let marketing: EmailProvider | undefined;
let trackedProvider: EmailProvider | undefined;

function build(configurationSetName: string | undefined): EmailProvider {
  return new SesEmailProvider({
    region: process.env.AWS_REGION,
    configurationSetName,
    defaultFrom: {
      email: process.env.NOTIFY_FROM_EMAIL ?? "noreply@tiffingrab.ca",
      name: process.env.NOTIFY_FROM_NAME ?? "Tiffin Grab",
    },
  });
}

/**
 * The SES provider for transactional mail (OTP, orders, reminders). Every real
 * send (auth mail, the notification outbox, campaigns) is tracked in
 * notification_outbox itself (status/providerMessageId/lastError).
 *
 * `SES_TRANSACTIONAL_CONFIGURATION_SET` publishes bounce/complaint/delivery but
 * no OPEN/CLICK: open/click tracking makes SES add a pixel and rewrite every
 * link through awstrack.me, which pushes OTP mail toward spam. Unset → falls
 * back to the campaign set.
 */
export function getEmailProvider(): EmailProvider {
  transactional ??= build(
    process.env.SES_TRANSACTIONAL_CONFIGURATION_SET || process.env.SES_CONFIGURATION_SET,
  );
  return transactional;
}

/** The SES provider for marketing campaigns; `SES_CONFIGURATION_SET` keeps open/click stats. */
export function getMarketingEmailProvider(): EmailProvider {
  marketing ??= build(process.env.SES_CONFIGURATION_SET);
  return marketing;
}

/**
 * Transactional mail with open/click tracking, for events an admin opted in.
 * `undefined` when `SES_TRACKED_CONFIGURATION_SET` is unset, so callers fall
 * back to the untracked provider.
 */
export function getTrackedEmailProvider(): EmailProvider | undefined {
  const set = process.env.SES_TRACKED_CONFIGURATION_SET;
  if (!set) return undefined;
  return (trackedProvider ??= build(set));
}

/** Configured SES streams, in display order; unset config sets are omitted. */
export function emailStreams(): EmailStream[] {
  const all: (Omit<EmailStream, "configSet"> & { configSet: string | undefined })[] = [
    { id: "transactional", label: "Transactional", configSet: process.env.SES_TRANSACTIONAL_CONFIGURATION_SET, kind: "untracked" },
    { id: "transactional-tracked", label: "Transactional (tracked)", configSet: process.env.SES_TRACKED_CONFIGURATION_SET, kind: "tracked" },
    { id: "marketing", label: "Marketing", configSet: process.env.SES_CONFIGURATION_SET, kind: "marketing" },
  ];
  return all.filter((s): s is EmailStream => !!s.configSet);
}
