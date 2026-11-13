import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/db/client";
import { runtimeLeases } from "@/db/schema";
import { acquireLease, readLeaseValue, releaseLease, renewLease, writeLeaseValue } from "../lease";
import { PAY_IN_PROGRESS, withCustomerPayLock } from "@/lib/payments/customer-pay-lock";

beforeEach(async () => {
  await db.delete(runtimeLeases).where(like(runtimeLeases.key, "t4:%"));
  await db.delete(runtimeLeases).where(like(runtimeLeases.key, "pay-lock:t4-%"));
});

describe("runtime leases", () => {
  it("concurrent acquire grants one holder", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => acquireLease("t4:race", randomUUID(), 5000)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("expired lease can be taken", async () => {
    expect(await acquireLease("t4:exp", "a", 1)).toBe(true);
    await new Promise((r) => setTimeout(r, 15));
    expect(await acquireLease("t4:exp", "b", 5000)).toBe(true);
    expect(await acquireLease("t4:exp", "c", 5000)).toBe(false);
  });

  it("release by non-holder is a no-op", async () => {
    await acquireLease("t4:rel", "a", 5000);
    await releaseLease("t4:rel", "b");
    expect(await acquireLease("t4:rel", "c", 5000)).toBe(false);
    await releaseLease("t4:rel", "a");
    expect(await acquireLease("t4:rel", "c", 5000)).toBe(true);
  });

  it("renew extends only for the holder", async () => {
    await acquireLease("t4:renew", "a", 5000);
    expect(await renewLease("t4:renew", "b", 5000)).toBe(false);
    expect(await renewLease("t4:renew", "a", 5000)).toBe(true);
  });

  it("keeps a value across release and acquire", async () => {
    expect(await readLeaseValue("t4:val")).toBeNull();
    await writeLeaseValue("t4:val", "tag-1");
    await writeLeaseValue("t4:val", "tag-2");
    expect(await readLeaseValue("t4:val")).toBe("tag-2");
    await acquireLease("t4:val", "a", 5000);
    await releaseLease("t4:val", "a");
    expect(await readLeaseValue("t4:val")).toBe("tag-2");
  });

  it("withCustomerPayLock rejects a second concurrent call with PAY_IN_PROGRESS and runs fn once", async () => {
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = withCustomerPayLock("t4-user", async () => {
      runs += 1;
      await gate;
      return "done";
    });
    await new Promise((r) => setTimeout(r, 50));
    await expect(withCustomerPayLock("t4-user", async () => { runs += 1; })).rejects.toThrow(PAY_IN_PROGRESS);
    release();
    expect(await first).toBe("done");
    expect(runs).toBe(1);
    expect(await withCustomerPayLock("t4-user", async () => "again")).toBe("again");
  });

  it("withCustomerPayLock releases when fn throws", async () => {
    await expect(withCustomerPayLock("t4-throw", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await withCustomerPayLock("t4-throw", async () => "ok")).toBe("ok");
  });

  it("20 overlapping withCustomerPayLock calls run fn once", async () => {
    let runs = 0;
    const out = await Promise.allSettled(Array.from({ length: 20 }, () => withCustomerPayLock("t4-many", async () => { runs += 1; await new Promise((r) => setTimeout(r, 200)); })));
    expect(runs).toBe(1);
    expect(out.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  });
});
