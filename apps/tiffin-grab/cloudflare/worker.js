// Custom Worker entry: OpenNext's fetch handler plus the Queue consumer, the per-minute Cron
// and the OptimoRoute poller Durable Object. wrangler.jsonc `main` points here.
import openNext from "../.open-next/worker.js";

export * from "../.open-next/worker.js";

const POLL_MS = 30_000;

// The notification tick runs in the app (it needs the DB and the Next runtime), so the
// Worker only re-enters itself over the service binding.
async function tick(env) {
  const res = await env.WORKER_SELF_REFERENCE.fetch("https://internal/api/cron/notifications?mode=tick", {
    method: "POST",
    headers: { authorization: "Bearer " + env.CRON_SECRET },
  });
  if (!res.ok) console.error("notifications tick failed", res.status, await res.text().catch(() => ""));
}

// Public pages are ISR (stale-while-revalidate): this per-minute check revalidates them at local midnight and promo edges.
async function publicSite(env) {
  const res = await env.WORKER_SELF_REFERENCE.fetch("https://internal/api/cron/public-site", {
    method: "POST",
    headers: { authorization: "Bearer " + env.CRON_SECRET },
  });
  if (!res.ok) console.error("public-site check failed", res.status, await res.text().catch(() => ""));
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

  // RPC, called from scheduled(): keeps the alarm chain alive if it ever broke.
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
  fetch: openNext.fetch,
  async queue(_batch, env) {
    await tick(env);
  },
  async scheduled(_event, env, ctx) {
    const guard = (p) => p.catch((err) => console.error("scheduled task threw", err));
    ctx.waitUntil(Promise.all([guard(tick(env)), guard(armPoller(env)), guard(publicSite(env))]));
  },
};
