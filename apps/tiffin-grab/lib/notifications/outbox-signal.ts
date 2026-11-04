import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createLogger } from "@foundry/commons/logger";
import { isWorkers } from "@/lib/runtime/platform";

const log = createLogger("outbox-signal");

/**
 * Wake the outbox consumer with a Queue message (the binding is read per call, never cached).
 * Call it after the enqueuing transaction commits, or the consumer can drain before the rows
 * exist. A lost signal only delays the mail until the next signal (Queue message or CampaignWake), so
 * this never fails the caller. A no-op off Workers (dev, tests).
 */
export async function signalOutbox(): Promise<void> {
  if (!isWorkers()) return;
  try {
    await (getCloudflareContext().env as { OUTBOX: { send(m: { at: number }): Promise<void> } }).OUTBOX.send({ at: Date.now() });
  } catch (err) {
    log.warn({ err }, "outbox signal failed");
  }
}
