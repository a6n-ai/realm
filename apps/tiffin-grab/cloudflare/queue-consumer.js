// Queue consumer logic, kept apart from worker.js so it can be unit-tested.
// Queues allows delays of 0..43200 s; 30 s floor so a failing send is not hammered.
export const MIN_RETRY_S = 30;
export const MAX_RETRY_S = 43200;

export const retryDelaySeconds = (ms) => Math.min(MAX_RETRY_S, Math.max(MIN_RETRY_S, Math.ceil((ms ?? 0) / 1000)));

/**
 * runTick() drains the outbox through the app and resolves `{ ok, retryAfterMs }`: retryAfterMs is how long
 * until the earliest row still pending is due (null when none). Exactly-once stays with the app's claim
 * (FOR UPDATE SKIP LOCKED), which a re-delivered message goes through again, so it only reaches rows still pending.
 * The messages are wake-up signals, not per-row, so a pending row means the whole batch is re-delivered.
 */
export async function consume(batch, runTick) {
  let result;
  try {
    result = await runTick();
  } catch (err) {
    console.error("outbox tick threw", err);
    result = { ok: false, retryAfterMs: 0 };
  }
  const retry = !result.ok || result.retryAfterMs != null;
  for (const msg of batch.messages) {
    if (retry) msg.retry({ delaySeconds: retryDelaySeconds(result.retryAfterMs) });
    else msg.ack();
  }
}
