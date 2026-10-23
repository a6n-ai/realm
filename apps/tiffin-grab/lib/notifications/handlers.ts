import { buildHandlers, type ChannelProvider } from "@relay/engine";
import { getEmailProvider, getMarketingEmailProvider } from "@/lib/email/provider";
import { db } from "@/db/client";
import { campaignConfig } from "./campaign-config";
import { notificationTables, usersRef } from "./tables";
import { broadcast } from "./broadcast";

/** Adapt @relay/email's EmailProvider to the package's ChannelProvider shape. */
function emailChannelProvider(): ChannelProvider {
  return {
    // The engine sets `from` only for marketing mail (the campaign sender);
    // everything else leaves from the transactional sender and config set.
    send: (msg) =>
      (msg.from ? getMarketingEmailProvider() : getEmailProvider()).send({
        to: { email: msg.to.email! },
        from: msg.from,
        // Sent from noreply@, so replies need somewhere a person reads.
        replyTo: { email: process.env.NOTIFY_REPLY_TO ?? "info@tiffingrab.ca" },
        subject: msg.subject!,
        html: msg.html,
        text: msg.text,
        attachments: msg.attachments,
        headers: msg.headers,
      }),
  };
}

export async function buildAppHandlers() {
  return buildHandlers({
    db,
    tables: notificationTables,
    users: usersRef,
    providers: { email: emailChannelProvider() },
    broadcast,
    campaigns: await campaignConfig(),
  });
}
