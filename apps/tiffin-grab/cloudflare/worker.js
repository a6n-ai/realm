// Custom Worker entry: OpenNext's fetch handler plus the Queue consumer, the Workflows that wake
// campaign sends and page refreshes (no cron), and the OptimoRoute poller Durable Object. wrangler.jsonc `main` points here.
import openNext from "../.open-next/worker.js";

export * from "../.open-next/worker.js";
export { CampaignWake, SiteRefreshWake } from "./workflows.js";
import { bootOnce } from "./bootstrap.js";
import { consume } from "./queue-consumer.js";

const POLL_MS = 30_000;

// The notification tick runs in the app (it needs the DB and the Next runtime), so the
// Worker only re-enters itself over the service binding.
async function tick(env) {
  const res = await env.WORKER_SELF_REFERENCE.fetch("https://internal/api/cron/notifications?mode=tick", {
    method: "POST",
    headers: { authorization: "Bearer " + env.CRON_SECRET },
  });
  if (!res.ok) {
    console.error("notifications tick failed", res.status, await res.text().catch(() => ""));
    return { ok: false, retryAfterMs: 0 };
  }
  const body = await res.json().catch(() => ({}));
  return { ok: true, retryAfterMs: body.retryAfterMs ?? null };
}

async function armPoller(env) {
  if (env.OPTIMO_EVENTS !== "on") return;
  await env.OPTIMO_POLLER.getByName("events").arm();
}

export class OptimoPoller {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  // RPC, called from the isolate bootstrap: keeps the alarm chain alive if it ever broke.
  async arm() {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + POLL_MS);
  }

  async alarm() {
    // Re-arm first so a slow or failed poll never ends the chain; stop when the var is off.
    if (this.env.OPTIMO_EVENTS !== "on") return;
    await this.ctx.storage.setAlarm(Date.now() + POLL_MS);
    try {
      const res = await this.env.WORKER_SELF_REFERENCE.fetch("https://internal/api/cron/optimo-events", {
        method: "POST",
        headers: { authorization: "Bearer " + this.env.CRON_SECRET },
      });
      if (!res.ok) console.error("optimo-events poll failed", res.status);
    } catch (err) {
      console.error("optimo-events poll threw", err);
    }
  }
}

export default {
  fetch(request, env, ctx) {
    bootOnce(env, ctx, armPoller);
    return openNext.fetch(request, env, ctx);
  },
  async queue(batch, env) {
    await consume(batch, () => tick(env));
  },
};
