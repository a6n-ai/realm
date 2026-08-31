import { createLogger } from "@foundry/commons/logger";
import { drainPending } from "../lib/notifications/drain";

const log = createLogger("relay-drainer");
const INTERVAL_MS = Number(process.env.NOTIFY_DRAIN_INTERVAL_MS ?? 15_000);

export async function drainLoop(opts: {
  intervalMs: number;
  signal?: AbortSignal;
  drain?: () => Promise<number>;
}): Promise<void> {
  const drain = opts.drain ?? (() => drainPending());
  while (!opts.signal?.aborted) {
    try {
      const n = await drain();
      if (n > 0) log.info({ processed: n }, "drained");
    } catch (err) {
      log.error({ err }, "drain failed");
    }
    if (opts.signal?.aborted) break;
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
}

if (process.argv[1]?.endsWith("notify-drainer.ts")) {
  const controller = new AbortController();
  process.on("SIGTERM", () => controller.abort());
  process.on("SIGINT", () => controller.abort());
  drainLoop({ intervalMs: INTERVAL_MS, signal: controller.signal }).catch((err) => {
    log.error({ err }, "fatal");
    process.exit(1);
  });
}
