import { eventCategory } from "./events";
import { settingsCache, saveSetting } from "@/lib/settings";
import { db } from "@/db/client";
import { app } from "@/db/schema";

export async function getTrackedEmailEvents(): Promise<string[]> {
  return settingsCache.getOrSet("trackedEmailEvents", async () => {
    const [row] = await db.select({ v: app.trackedEmailEvents }).from(app).limit(1);
    return row?.v ?? [];
  });
}

export async function setTrackedEmailEvents(events: string[]): Promise<void> {
  const cleaned = [...new Set(events.filter((e) => e && eventCategory(e) !== "account"))];
  await saveSetting({ trackedEmailEvents: cleaned });
}
