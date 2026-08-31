import { createRateLimiter, drainPending as drain } from "@relay/engine";
import { db } from "@/db/client";
import { notificationTables } from "./tables";
import { buildAppHandlers } from "./handlers";

// SES MaxSendRate is 14/s on this account; stay under it so a burst cannot
// trigger throttling, which damages sender reputation.
const SEND_RATE = Number(process.env.NOTIFY_SEND_RATE ?? 10);

export function drainPending(limit = 25, maxBatches = 20): Promise<number> {
  return drain(
    {
      db,
      tables: notificationTables,
      handlers: buildAppHandlers(),
      rateLimiter: createRateLimiter(SEND_RATE),
    },
    limit,
    maxBatches,
  );
}
