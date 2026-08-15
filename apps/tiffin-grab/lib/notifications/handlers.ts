import { buildHandlers, type BroadcastInput, type ChannelProvider } from "@realm/notifications";
import { getEmailProvider } from "@/lib/email/provider";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "./tables";
import { broadcast } from "./broadcast";
import { publishPush } from "./rabbit";

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

/**
 * Publish-after-commit: hand the realtime push to RabbitMQ; the worker calls
 * broadcast(). If the broker is unavailable, fall back to the inline push so
 * the live ping still fires.
 */
export const appBroadcast = async (input: BroadcastInput): Promise<void> => {
  if (!(await publishPush(input))) await broadcast(input);
};

export function buildAppHandlers() {
  return buildHandlers({
    db,
    tables: notificationTables,
    users: usersRef,
    providers: { email: emailChannelProvider() },
    broadcast: appBroadcast,
  });
}
