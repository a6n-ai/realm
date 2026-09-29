import Redis from "ioredis";
import { runSignalLoop } from "@relay/engine";
import { createLogger } from "@foundry/commons/logger";
import { drainPending } from "./drain";
import { OUTBOX_SIGNAL_KEY } from "./outbox-signal";

const log = createLogger("outbox-listener");
const WAIT_SECONDS = 30;

/** Started once per server from instrumentation.ts. */
export function startOutboxListener(): void {
  const url = process.env.REDIS_URL;
  if (!url) {
    log.warn({}, "REDIS_URL not set; outbox listener not started");
    return;
  }
  // BLPOP holds its connection for the whole wait, so the listener gets its own.
  // maxRetriesPerRequest: null parks the wait while Redis reconnects instead of
  // failing it, so an outage cannot spin the loop.
  const listener = new Redis(url, { maxRetriesPerRequest: null });
  listener.on("error", () => {});
  void runSignalLoop({
    waitForSignal: async () => (await listener.blpop(OUTBOX_SIGNAL_KEY, WAIT_SECONDS)) !== null,
    drain: () => drainPending(),
    log,
  });
  log.info({}, "outbox listener started");
}
