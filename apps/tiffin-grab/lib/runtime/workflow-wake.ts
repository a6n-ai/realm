import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createWake } from "../../cloudflare/wake.js";
import { isWorkers } from "./platform";

type Workflow = { create(o: { id: string; params: { at: number } }): Promise<unknown> };

async function wake(binding: "CAMPAIGN_WAKE" | "SITE_REFRESH_WAKE", prefix: string, at: number): Promise<void> {
  if (!isWorkers()) return;
  try {
    const env = getCloudflareContext().env as unknown as Record<string, Workflow>;
    await createWake(env[binding], prefix, at);
  } catch (err) {
    console.error(`${prefix} wake failed`, err);
  }
}

/** Run the notifications tick at `at` (epoch ms). Never throws. */
export const scheduleCampaignWake = (at: number): Promise<void> => wake("CAMPAIGN_WAKE", "wake", at);

/** Run the public-site check at `at` (epoch ms). Never throws. */
export const scheduleSiteRefreshWake = (at: number): Promise<void> => wake("SITE_REFRESH_WAKE", "site", at);
