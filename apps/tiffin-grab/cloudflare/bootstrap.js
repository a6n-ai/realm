import { createWake } from "./wake.js";

let booted = false;

// No cron: the first request on each isolate (re)starts the self-scheduling chains. Wake ids are
// deterministic and minute-rounded, so repeats across isolates collapse into one instance.
export function bootOnce(env, ctx, armPoller) {
  if (booted) return;
  booted = true;
  const now = Date.now();
  const guard = (p) => p.catch((err) => console.error("bootstrap task threw", err));
  ctx.waitUntil(
    Promise.all([
      guard(createWake(env.SITE_REFRESH_WAKE, "site", now + 3600_000)),
      guard(createWake(env.CAMPAIGN_WAKE, "wake", now + 60_000)),
      guard(Promise.resolve().then(() => armPoller(env))),
    ]),
  );
}

export const resetBootForTest = () => {
  booted = false;
};
