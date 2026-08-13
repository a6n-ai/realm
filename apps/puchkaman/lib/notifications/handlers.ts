import { buildHandlers, type ChannelProvider } from "@realm/notifications";
import { getEmailProvider } from "@/lib/email/provider";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "./tables";
import { broadcastNotification } from "./broadcast";

/** Adapt @realm/email's EmailProvider to the package's ChannelProvider shape. */
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

export function buildAppHandlers() {
  return buildHandlers({
    db,
    tables: notificationTables,
    users: usersRef,
    providers: { email: emailChannelProvider() },
    broadcast: (input) => broadcastNotification({ userId: input.userId }),
  });
}
