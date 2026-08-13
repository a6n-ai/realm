import { createRateLimiter, drainPending as drain } from "@realm/notifications";
import { db } from "@/db/client";
import { notificationTables } from "./tables";
import { buildAppHandlers } from "./handlers";

// SES MaxSendRate on this account is 14/s and is shared with tiffin-grab, so
// each app stays well under it — throttling damages sender reputation.
const SEND_RATE = Number(process.env.NOTIFY_SEND_RATE ?? 5);

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
