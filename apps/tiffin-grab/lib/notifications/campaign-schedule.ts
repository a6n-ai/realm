import { dueCampaigns } from "@relay/engine";
import { db } from "@/db/client";
import { notificationTables } from "./tables";

export function dueScheduledCampaignIds(now = Date.now()): Promise<string[]> {
  return dueCampaigns(db, notificationTables, now);
}
