import { type EmailProvider, type EmailStream, SesEmailProvider } from "@relay/email";
import { awsRegion, notifyFrom, sesConfigSet, sesTrackedConfigSet, sesTransactionalConfigSet } from "@/lib/runtime/env";

let transactional: EmailProvider | undefined;
let marketing: EmailProvider | undefined;
let trackedProvider: EmailProvider | undefined;

function build(configurationSetName: string | undefined): EmailProvider {
  return new SesEmailProvider({
    region: awsRegion(),
    configurationSetName,
    defaultFrom: notifyFrom(),
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
    sesTransactionalConfigSet() || sesConfigSet(),
  );
  return transactional;
}

/** The SES provider for marketing campaigns; `SES_CONFIGURATION_SET` keeps open/click stats. */
export function getMarketingEmailProvider(): EmailProvider {
  marketing ??= build(sesConfigSet());
  return marketing;
}

/**
 * Transactional mail with open/click tracking, for events an admin opted in.
 * `undefined` when `SES_TRACKED_CONFIGURATION_SET` is unset, so callers fall
 * back to the untracked provider.
 */
export function getTrackedEmailProvider(): EmailProvider | undefined {
  const set = sesTrackedConfigSet();
  if (!set) return undefined;
  return (trackedProvider ??= build(set));
}

/** Configured SES streams, in display order; unset config sets are omitted. */
export function emailStreams(): EmailStream[] {
  const all: (Omit<EmailStream, "configSet"> & { configSet: string | undefined })[] = [
    { id: "transactional", label: "Transactional", configSet: sesTransactionalConfigSet(), kind: "untracked" },
    { id: "transactional-tracked", label: "Transactional (tracked)", configSet: sesTrackedConfigSet(), kind: "tracked" },
    { id: "marketing", label: "Marketing", configSet: sesConfigSet(), kind: "marketing" },
  ];
  return all.filter((s): s is EmailStream => !!s.configSet);
}
