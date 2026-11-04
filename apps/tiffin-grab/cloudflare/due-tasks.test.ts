import { describe, expect, it } from "vitest";
import { dueTasks, readMarkers } from "./due-tasks.js";

const now = 1_000_000_000_000;
const base = { now, minute: 7, notifyNext: String(now + 60_000), siteNext: String(now + 60_000) };

describe("dueTasks", () => {
  it("runs nothing while every marker is in the future", () => {
    expect(dueTasks(base)).toEqual({ notify: false, site: false });
  });

  it("notifications are due at or past next, or with next missing/garbled", () => {
    expect(dueTasks({ ...base, notifyNext: String(now) }).notify).toBe(true);
    expect(dueTasks({ ...base, notifyNext: null }).notify).toBe(true);
    expect(dueTasks({ ...base, notifyNext: "abc" }).notify).toBe(true);
    expect(dueTasks({ ...base, notifyNext: String(now + 1) }).notify).toBe(false);
  });

  it("the public site is due at or past next, or with next missing", () => {
    expect(dueTasks({ ...base, siteNext: String(now - 1) }).site).toBe(true);
    expect(dueTasks({ ...base, siteNext: null }).site).toBe(true);
    expect(dueTasks({ ...base, siteNext: String(now + 1) }).site).toBe(false);
  });

  it("safety: both run on the hour only", () => {
    expect(dueTasks({ ...base, minute: 0 })).toEqual({ notify: true, site: true });
    expect(dueTasks({ ...base, minute: 15 })).toEqual({ notify: false, site: false });
  });
});

describe("readMarkers", () => {
  const kv = (data: Record<string, string>) => ({ get: async (k: string) => data[k] ?? null });

  it("reads both keys", async () => {
    const data = { "cron:notify:next": String(now + 60_000), "cron:site:next": String(now + 60_000) };
    expect(await readMarkers(kv(data), now, 7)).toEqual({ notify: false, site: false });
    expect(await readMarkers(kv({ ...data, "cron:notify:next": String(now - 1) }), now, 7)).toEqual({ notify: true, site: false });
  });

  it("treats a failed read as due", async () => {
    const broken = { get: async () => Promise.reject(new Error("kv down")) };
    expect(await readMarkers(broken, now, 7)).toEqual({ notify: true, site: true });
  });
});
