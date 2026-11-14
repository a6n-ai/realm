import { retryFailedCampaign } from "@relay/engine";
import { db } from "@/db/client";
import { adminIdRoute } from "@/lib/notifications/admin-route";
import { notificationTables } from "@/lib/notifications/tables";

export const POST = adminIdRoute((_req, id) => retryFailedCampaign({ db, tables: notificationTables }, id),
  { signal: (result) => result.requeued > 0 },
);
