// Which per-minute cron tasks have work. Pure so it can be unit-tested; the keys are written by the app
// (lib/runtime/cron-markers.ts). A missing or unparseable marker, or a failed read, counts as due.
export const NOTIFY_NEXT_KEY = "cron:notify:next";
export const SITE_NEXT_KEY = "cron:site:next";

const dueAt = (raw, now) => {
  const at = Number(raw);
  return raw == null || !Number.isFinite(at) || now >= at;
};

// The safety minutes cover a lost marker write: both hourly.
export function dueTasks({ now, minute, notifyNext, siteNext }) {
  return {
    notify: dueAt(notifyNext, now) || minute === 0,
    site: dueAt(siteNext, now) || minute === 0,
  };
}

export async function readMarkers(kv, now, minute) {
  const read = (k) => kv.get(k).then((v) => ({ v }), () => ({ failed: true }));
  const [next, site] = await Promise.all([read(NOTIFY_NEXT_KEY), read(SITE_NEXT_KEY)]);
  if (next.failed || site.failed) return { notify: true, site: true };
  return dueTasks({ now, minute, notifyNext: next.v, siteNext: site.v });
}
