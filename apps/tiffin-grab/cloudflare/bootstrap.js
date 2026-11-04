import { createWake } from "./wake.js";

let booted = false;
const TTL_S = 30 * 24 * 3600;

// No cron: the first request after each DEPLOYMENT (re)starts the self-scheduling chains. A new isolate
// is cheap and constant, so the deployment version id in KV gates this, not the isolate: each isolate
// reads KV once. KV read failure skips it; the chains sustain themselves once started.
export function bootOnce(env, ctx, armPoller) {
  if (booted) return;
  booted = true;
  const guard = (p) => p.catch((err) => console.error("bootstrap task threw", err));
  ctx.waitUntil(
    guard(
      (async () => {
        const key = `wake-bootstrap:${env.CF_VERSION_METADATA?.id ?? "unknown"}`;
        let seen;
        try {
          seen = await env.CACHE.get(key);
        } catch (err) {
          console.error("bootstrap marker read failed; skipping", err);
          return;
        }
        if (seen != null) return;
        await env.CACHE.put(key, "1", { expirationTtl: TTL_S });
        const now = Date.now();
        await Promise.all([
          guard(createWake(env.SITE_REFRESH_WAKE, "site", now + 3600_000)),
          guard(createWake(env.CAMPAIGN_WAKE, "wake", now + 60_000)),
          guard(Promise.resolve().then(() => armPoller(env))),
        ]);
      })(),
    ),
  );
}

export const resetBootForTest = () => {
  booted = false;
};
