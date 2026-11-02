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

// DIAG (temporary, revert the commit labeled diag:): isolate identity, request count and heap per response.
const DIAG_ID = Math.random().toString(36).slice(2, 7);
const DIAG_START = Date.now();
let diagN = 0;
function heapMb() {
  try {
    return Math.round(process.memoryUsage().heapUsed / 1048576);
  } catch {
    return -1;
  }
}
async function diagFetch(request, env, ctx) {
  const n = ++diagN;
  const t0 = Date.now();
  const heapBefore = heapMb();
  const res = await openNext.fetch(request, env, ctx);
  const ttfb = Date.now() - t0;
  const path = new URL(request.url).pathname;
  const tag = `${DIAG_ID}.n${n}.age${Date.now() - DIAG_START}.heap${heapBefore}>${heapMb()}.ttfb${ttfb}`;
  const out = new Response(res.body, res);
  out.headers.set("x-diag", tag);
  console.log(JSON.stringify({ diag: tag, path }));
  return out;
}

export default {
  fetch: diagFetch,
  async queue(_batch, env) {
    await tick(env);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(Promise.all([tick(env), armPoller(env)]));
  },
};
