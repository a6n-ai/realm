import amqplib from "amqplib";
import type { BroadcastInput } from "./broadcast";

export const NOTIFY_EXCHANGE = "notify";
export const NOTIFY_QUEUE = "notify.push";
export const NOTIFY_DLX = "notify.dlx";
export const NOTIFY_DLQ = "notify.dlq";
const ROUTING_PREFIX = "push";

export async function assertNotifyTopology(ch: amqplib.Channel): Promise<void> {
  await ch.assertExchange(NOTIFY_EXCHANGE, "topic", { durable: true });
  await ch.assertExchange(NOTIFY_DLX, "fanout", { durable: true });
  await ch.assertQueue(NOTIFY_DLQ, { durable: true });
  await ch.bindQueue(NOTIFY_DLQ, NOTIFY_DLX, "");
  await ch.assertQueue(NOTIFY_QUEUE, {
    durable: true,
    arguments: { "x-dead-letter-exchange": NOTIFY_DLX },
  });
  await ch.bindQueue(NOTIFY_QUEUE, NOTIFY_EXCHANGE, `${ROUTING_PREFIX}.*`);
}

// Lazy singleton: one connection + confirm channel per process. Reconnect on close.
let chanPromise: Promise<amqplib.ConfirmChannel> | null = null;

async function getChannel(url: string): Promise<amqplib.ConfirmChannel> {
  if (!chanPromise) {
    chanPromise = (async () => {
      const conn = await amqplib.connect(url);
      conn.on("close", () => { chanPromise = null; });
      conn.on("error", () => { chanPromise = null; });
      const ch = await conn.createConfirmChannel();
      await assertNotifyTopology(ch);
      return ch;
    })().catch((err) => { chanPromise = null; throw err; });
  }
  return chanPromise;
}

/** Publish persistently. Returns true on broker confirm, false otherwise. Never throws. */
export async function publishPush(payload: BroadcastInput): Promise<boolean> {
  const url = process.env.RABBITMQ_URL;
  if (!url) return false;
  try {
    const ch = await getChannel(url);
    const body = Buffer.from(
      JSON.stringify({ ...payload, userId: String(payload.userId) }),
    );
    return await new Promise<boolean>((resolve) => {
      ch.publish(
        NOTIFY_EXCHANGE,
        `${ROUTING_PREFIX}.${payload.event}`,
        body,
        { persistent: true, contentType: "application/json" },
        (err) => resolve(!err),
      );
    });
  } catch {
    chanPromise = null;
    return false;
  }
}
