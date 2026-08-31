import { buildHandlers, type ChannelProvider } from "@relay/engine";
import { getEmailProvider } from "@/lib/email/provider";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "./tables";
import { broadcastNotification } from "./broadcast";
import { getSmsProvider } from "./sms-provider";
import { getWhatsAppProvider } from "./whatsapp-provider";

/** Adapt @relay/email's EmailProvider to the package's ChannelProvider shape. */
function emailChannelProvider(): ChannelProvider {
  const provider = getEmailProvider();
  return {
    send: (msg) =>
      provider.send({
        to: { email: msg.to.email! },
        subject: msg.subject!,
        html: msg.html,
        text: msg.text,
      }),
  };
}

/**
 * Campaign config, or undefined when the footer inputs are missing.
 *
 * Returning undefined makes the handler SKIP campaign rows rather than send a
 * commercial message with no unsubscribe link and no postal address — which is
 * the failure CASL actually penalises. A missing env var stops marketing and
 * leaves transactional mail untouched.
 */
function campaignConfig() {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  const postalAddress = process.env.CAMPAIGN_POSTAL_ADDRESS;
  const baseUrl = process.env.CAMPAIGN_BASE_URL ?? process.env.SITE_URL;
  if (!secret || !postalAddress || !baseUrl) return undefined;
  return {
    tables: notificationTables,
    unsubscribe: { baseUrl, secret },
    sender: { name: process.env.CAMPAIGN_SENDER_NAME ?? "Puchkaman", postalAddress },
  };
}

export function buildAppHandlers() {
  return buildHandlers({
    db,
    tables: notificationTables,
    users: usersRef,
    providers: {
      email: emailChannelProvider(),
      sms: getSmsProvider(),
      whatsapp: getWhatsAppProvider(),
    },
    broadcast: (input) => broadcastNotification({ userId: input.userId }),
    campaigns: campaignConfig(),
  });
}
