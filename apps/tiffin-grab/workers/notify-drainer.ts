import { runDrainLoop } from "@relay/engine";
import { createLogger } from "@foundry/commons/logger";
import { drainPending, materializeDue } from "@/lib/notifications/drain";

const log = createLogger("notify-drainer");

const INTERVAL_MS = Number(process.env.NOTIFY_DRAIN_INTERVAL_MS ?? 15_000);

// Entry point when run directly (tsx workers/notify-drainer.ts).
if (process.argv[1]?.endsWith("notify-drainer.ts")) {
  const controller = new AbortController();
  process.on("SIGTERM", () => controller.abort());
  process.on("SIGINT", () => controller.abort());
  runDrainLoop({
    intervalMs: INTERVAL_MS,
    signal: controller.signal,
    drain: () => drainPending(),
    materialize: materializeDue,
    log,
  }).catch((err) => {
    log.error({ err }, "fatal");
    process.exit(1);
  });
}
