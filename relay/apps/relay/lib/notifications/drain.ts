import { buildTenantHandlers, createRateLimiter, drainPending as drain } from "@relay/engine";
import type { ChannelProvider } from "@relay/engine";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { getEmailProvider } from "@/lib/email/provider";

const SEND_RATE = Number(process.env.NOTIFY_SEND_RATE ?? 5);

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

export function drainPending(limit = 25, maxBatches = 20): Promise<number> {
  return drain(
    {
      db,
      tables: notificationTables as never,
      handlers: buildTenantHandlers({
        db,
        tables: notificationTables,
        providers: { email: emailChannelProvider() },
      }),
      rateLimiter: createRateLimiter(SEND_RATE),
    },
    limit,
    maxBatches,
  );
}
