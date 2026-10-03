import Redis from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { CAMPAIGN_SCHEDULE_KEY, clearScheduledIds, dueScheduledIds } from "../campaign-schedule";

// Needs a real Redis (local dev has one); skipped without REDIS_URL.
const url = process.env.REDIS_URL;
const redis = url ? new Redis(url) : null;
afterAll(async () => { await redis?.quit(); });

describe.skipIf(!redis)("campaign schedule set", () => {
  it("returns only campaigns whose send time has come, and clears them", async () => {
    const r = redis!;
    await r.del(CAMPAIGN_SCHEDULE_KEY);
    await r.zadd(CAMPAIGN_SCHEDULE_KEY, 1_000, "cmp_due", 5_000, "cmp_later");
    expect(await dueScheduledIds(r, 2_000)).toEqual(["cmp_due"]);
    await clearScheduledIds(r, ["cmp_due"]);
    expect(await dueScheduledIds(r, 2_000)).toEqual([]);
    expect(await dueScheduledIds(r, 6_000)).toEqual(["cmp_later"]);
    await r.del(CAMPAIGN_SCHEDULE_KEY);
  });
});
