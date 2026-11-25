import { runInBackground } from "@foundry/cloud/background";
import { cfEnv } from "@/lib/runtime/cf-env";
import { emailViaRelay } from "@/lib/runtime/env";
import { createLogger } from "@foundry/commons/logger";
import { isWorkers } from "@foundry/commons/runtime/platform";

const log = createLogger("outbox-signal");

/**
 * Wake the outbox consumer with a Queue message (the binding is read per call, never cached).
 * Call it after the enqueuing transaction commits, or the consumer can drain before the rows
 * exist. A lost signal only delays the mail until the next signal (Queue message or CampaignWake), so
 * this never fails the caller. A no-op off Workers (dev, tests).
 */
export async function signalOutbox(): Promise<void> {
  if (!isWorkers()) return;
  // Fast path: hand due relay_outbox rows to Relay now, after the response. The claim is SKIP LOCKED with a lease
  // and Relay dedupes on idempotencyKey, so a race with the tick sends once; anything left waits for the tick.
  if (emailViaRelay()) {
    runInBackground(async () => (await import("@/lib/relay/forward")).forwardRelayOutbox(), "relay fast path");
  }
  try {
    await cfEnv().OUTBOX.send({ at: Date.now() });
  } catch (err) {
    log.warn({ err }, "outbox signal failed");
  }
}
