import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createWake } from "../../cloudflare/wake.js";
import { isWorkers } from "@foundry/commons/runtime/platform";

type Workflow = { create(o: { id: string; params: { at: number } }): Promise<unknown> };

// A wake is never closer than a minute: ids are minute-rounded, and an id already used by an instance that
// finished would swallow a nearer one ("already exists") and nothing would fire.
const MIN_LEAD_MS = 60_000;

async function wake(binding: "CAMPAIGN_WAKE" | "SITE_REFRESH_WAKE", prefix: string, requestedAt: number): Promise<void> {
  if (!isWorkers()) return;
  const at = Math.max(requestedAt, Date.now() + MIN_LEAD_MS);
  try {
    const env = getCloudflareContext().env as unknown as Record<string, Workflow>;
    await createWake(env[binding], prefix, at);
  } catch (err) {
    console.error(`${prefix} wake failed`, err);
  }
}

/** Run the notifications tick at `at` (epoch ms), no sooner than a minute from now. Never throws. */
export const scheduleCampaignWake = (at: number): Promise<void> => wake("CAMPAIGN_WAKE", "wake", at);

/** Run the public-site check at `at` (epoch ms), no sooner than a minute from now. Never throws. */
export const scheduleSiteRefreshWake = (at: number): Promise<void> => wake("SITE_REFRESH_WAKE", "site", at);
