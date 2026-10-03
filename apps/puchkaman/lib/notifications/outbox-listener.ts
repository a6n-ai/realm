import Redis from "ioredis";
import { runSignalLoop } from "@relay/engine";
import { createLogger } from "@foundry/commons/logger";
import { drainPending, materializeDue } from "./drain";
import { OUTBOX_SIGNAL_KEY } from "./outbox-signal";
import { clearScheduledIds, dueScheduledIds, rebuildScheduledCampaigns } from "./campaign-schedule";

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

  // A scheduled campaign is due when its send time passes: on every wake-up (a signal or the
  // 30s timeout) ask Redis
  // (not the DB) whether one is, and if so expand it and report a signal so the loop drains.
  const startDueCampaigns = async (): Promise<boolean> => {
    const due = await dueScheduledIds(listener);
    if (!due.length) return false;
    try {
      const queued = await materializeDue();
      await clearScheduledIds(listener, due);
      log.info({ campaigns: due.length, queued }, "scheduled campaigns started");
      return true;
    } catch (err) {
      // Left in the set, so the next wake-up retries.
      log.error({ err }, "starting scheduled campaigns failed");
      return false;
    }
  };

  void rebuildScheduledCampaigns(listener)
    .then((n) => log.info({ scheduled: n }, "campaign schedule rebuilt"))
    .catch((err: unknown) => log.error({ err }, "campaign schedule rebuild failed"));

  void runSignalLoop({
    waitForSignal: async () => {
      const signalled = (await listener.blpop(OUTBOX_SIGNAL_KEY, WAIT_SECONDS)) !== null;
      // Checked every time, so a busy stream of signals can't hold a campaign back.
      const started = await startDueCampaigns();
      return signalled || started;
    },
    drain: () => drainPending(),
    log,
  });
  log.info({}, "outbox listener started");
}
