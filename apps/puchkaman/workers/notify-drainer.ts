import { createLogger } from "@foundry/commons/logger";
import { drainPending, materializeDue } from "@/lib/notifications/drain";

const log = createLogger("notify-drainer");

const INTERVAL_MS = Number(process.env.NOTIFY_DRAIN_INTERVAL_MS ?? 15_000);

export interface DrainLoopOptions {
  intervalMs: number;
  signal?: AbortSignal;
  /** Injected for tests. */
  drain?: () => Promise<number>;
  /** Injected for tests. */
  materialize?: () => Promise<number>;
}

/**
 * Poll the outbox forever.
 *
 * Postgres IS the queue — the outbox has FOR UPDATE SKIP LOCKED claiming,
 * backoff, attempt counting and a dead-letter status, so no broker is involved.
 * LISTEN/NOTIFY would remove the idle latency but is unusable here: pgbouncer
 * runs in transaction pooling mode and a LISTEN binds to a backend that gets
 * handed to the next client, silently dropping notifications.
 *
 * drainPending() already loops batches until the queue empties, so a burst
 * clears immediately; the interval only bounds idle latency.
 */
export async function drainLoop(opts: DrainLoopOptions): Promise<void> {
  const drain = opts.drain ?? (() => drainPending());
  const materialize = opts.materialize ?? materializeDue;
  while (!opts.signal?.aborted) {
    try {
      const queued = await materialize();
      if (queued > 0) log.info({ queued }, "campaign materialized");
    } catch (err) {
      // Kept separate from the drain try/catch below: a broken segment query
      // must not stop transactional mail from going out.
      log.error({ err }, "campaign materialization failed");
    }
    try {
      const n = await drain();
      if (n > 0) log.info({ processed: n }, "drained");
    } catch (err) {
      // The loop must never die: a transient database error would otherwise
      // leave every queued notification undelivered until the next deploy.
      log.error({ err }, "drain failed");
    }
    if (opts.signal?.aborted) break;
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
}

// Entry point when run directly (tsx workers/notify-drainer.ts).
if (process.argv[1]?.endsWith("notify-drainer.ts")) {
  const controller = new AbortController();
  process.on("SIGTERM", () => controller.abort());
  process.on("SIGINT", () => controller.abort());
  drainLoop({ intervalMs: INTERVAL_MS, signal: controller.signal }).catch((err) => {
    log.error({ err }, "fatal");
    process.exit(1);
  });
}
