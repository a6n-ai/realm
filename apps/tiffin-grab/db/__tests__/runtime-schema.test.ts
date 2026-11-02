import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { otpThrottle, rateLimit, runtimeLeases } from "../schema/runtime";

describe("runtime schema (Workers state that used to live in Redis/memory)", () => {
  it("runtime_leases: key, holder, expires_at, value, updated_at", () => {
    expect(getTableName(runtimeLeases)).toBe("runtime_leases");
    const c = getTableColumns(runtimeLeases);
    expect(c.key.primary).toBe(true);
    expect(c.holder.notNull).toBe(false);
    expect(c.expiresAt.name).toBe("expires_at");
    expect(c.expiresAt.notNull).toBe(false);
    expect(c.value.notNull).toBe(false);
    expect(c.updatedAt.notNull).toBe(true);
  });

  it("otp_throttle: key, count, window_start", () => {
    expect(getTableName(otpThrottle)).toBe("otp_throttle");
    const c = getTableColumns(otpThrottle);
    expect(c.key.primary).toBe(true);
    expect(c.count.notNull).toBe(true);
    expect(c.windowStart.name).toBe("window_start");
  });

  it("rate_limit has the Better Auth shape", () => {
    expect(getTableName(rateLimit)).toBe("rate_limit");
    const c = getTableColumns(rateLimit);
    expect(c.id.primary).toBe(true);
    expect(c.key.isUnique).toBe(true);
    expect(c.count.notNull).toBe(true);
    expect(c.lastRequest.name).toBe("last_request");
  });
});
