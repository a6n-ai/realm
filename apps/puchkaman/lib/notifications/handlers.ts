import { buildCampaignConfig, buildHandlers, type ChannelProvider } from "@relay/engine";
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
        attachments: msg.attachments,
      }),
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
    campaigns: buildCampaignConfig(notificationTables, process.env, { senderName: "Puchkaman" }),
  });
}
