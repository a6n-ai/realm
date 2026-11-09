import { buildHandlers, type ChannelProvider } from "@relay/engine";
import type { EmailProvider } from "@relay/email";
import { getEmailProvider, getMarketingEmailProvider } from "@/lib/email/provider";
import { db } from "@/db/client";
import { notifyReplyTo } from "@/lib/runtime/env";
import { campaignConfig } from "./campaign-config";
import { notificationTables, usersRef } from "./tables";
import { broadcast } from "./broadcast";
import { emailProviderFor } from "./email-provider-for";

/** Adapt @relay/email's EmailProvider to the package's ChannelProvider shape. */
function emailChannelProvider(pick: (msg: { from?: unknown }) => EmailProvider): ChannelProvider {
  return {
    // The engine sets `from` only for marketing mail (the campaign sender);
    // everything else leaves from the transactional sender and config set.
    send: (msg) =>
      pick(msg).send({
        to: { email: msg.to.email! },
        from: msg.from,
        // Sent from noreply@, so replies need somewhere a person reads.
        replyTo: { email: notifyReplyTo() },
        subject: msg.subject!,
        html: msg.html,
        text: msg.text,
        attachments: msg.attachments,
        headers: msg.headers,
        tags: msg.tags,
      }),
  };
}

export async function buildAppHandlers() {
  return buildHandlers({
    db,
    tables: notificationTables,
    users: usersRef,
    providers: {
      email: emailChannelProvider((msg) => (msg.from ? getMarketingEmailProvider() : getEmailProvider())),
    },
    emailProviderFor: async (event) => {
      const tracked = await emailProviderFor(event);
      return tracked && emailChannelProvider(() => tracked);
    },
    broadcast,
    campaigns: await campaignConfig(),
  });
}
