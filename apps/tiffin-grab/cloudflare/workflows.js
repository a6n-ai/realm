import { WorkflowEntrypoint } from "cloudflare:workers";

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

async function sleepThenPost(event, step, env, path) {
  const { at } = event.payload;
  if (at > Date.now()) await step.sleepUntil("wait", new Date(at));
  await step.do("run", RETRY, () => postSelf(env, path));
}

// The route re-schedules the next wake itself, so each instance is one-shot.
export class CampaignWake extends WorkflowEntrypoint {
  run(event, step) {
    return sleepThenPost(event, step, this.env, "/api/cron/notifications?mode=tick");
  }
}

export class SiteRefreshWake extends WorkflowEntrypoint {
  run(event, step) {
    return sleepThenPost(event, step, this.env, "/api/cron/public-site");
  }
}
