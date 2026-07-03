import amqplib from "amqplib";
import { broadcast, type BroadcastInput } from "../lib/notifications/broadcast";
import { assertNotifyTopology, NOTIFY_QUEUE } from "../lib/notifications/rabbit";

export async function handleMessage(raw: Buffer): Promise<void> {
  const m = JSON.parse(raw.toString()) as Omit<BroadcastInput, "userId"> & { userId: string };
  await broadcast({ ...m, userId: BigInt(m.userId) });
}

export async function startConsumer(): Promise<void> {
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error("RABBITMQ_URL is not set");
  // On a dropped broker connection amqplib emits 'error' → the process exits and
  // compose `restart: unless-stopped` restarts the worker (crude but sufficient reconnect).
  const conn = await amqplib.connect(url);
  const ch = await conn.createChannel();
  await assertNotifyTopology(ch);
  await ch.prefetch(10);
  await ch.consume(NOTIFY_QUEUE, (msg) => {
    if (!msg) return;
    handleMessage(msg.content)
      .then(() => ch.ack(msg))
      .catch((err) => {
        console.error("[notify-consumer] nack→dlq", err);
        ch.nack(msg, false, false); // no requeue → dead-letters to notify.dlq
      });
  });
  console.log(`[notify-consumer] consuming ${NOTIFY_QUEUE}`);
}

// Entry point when run directly (tsx workers/notify-consumer.ts).
if (process.argv[1]?.endsWith("notify-consumer.ts")) {
  startConsumer().catch((err) => {
    console.error("[notify-consumer] fatal", err);
    process.exit(1);
  });
}
