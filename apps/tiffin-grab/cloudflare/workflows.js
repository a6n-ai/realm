import { WorkflowEntrypoint } from "cloudflare:workers";
import { createWake } from "./wake.js";

// Page refresh and campaign sends run in the app (they need the DB and the Next runtime), so a
// Workflow only sleeps until its time and re-enters the Worker over the service binding.
async function postSelf(env, path) {
  const res = await env.WORKER_SELF_REFERENCE.fetch(`https://internal${path}`, {
    method: "POST",
    headers: { authorization: "Bearer " + env.CRON_SECRET },
  });
  if (!res.ok) throw new Error(`${path} failed ${res.status}`);
}

const RETRY = { retries: { limit: 5, delay: "30 seconds", backoff: "exponential" } };
const FALLBACK_MS = 15 * 60_000;

// The route books the next wake itself on success. If it still fails after the step's retries, book a
// fallback here so the chain never dies silently; the failure is logged and shows in Scheduled jobs.
async function sleepThenPost(event, step, env, path, binding, prefix) {
  await step.sleepUntil("wait", new Date(event.payload.at));
  try {
    await step.do("run", RETRY, () => postSelf(env, path));
  } catch (err) {
    console.error(`${prefix} wake failed after retries`, err);
    await step.do("fallback", () => createWake(env[binding], prefix, Date.now() + FALLBACK_MS));
  }
}

export class CampaignWake extends WorkflowEntrypoint {
  run(event, step) {
    return sleepThenPost(event, step, this.env, "/api/cron/notifications?mode=tick&wake=1", "CAMPAIGN_WAKE", "wake");
  }
}

export class SiteRefreshWake extends WorkflowEntrypoint {
  run(event, step) {
    return sleepThenPost(event, step, this.env, "/api/cron/public-site", "SITE_REFRESH_WAKE", "site");
  }
}
