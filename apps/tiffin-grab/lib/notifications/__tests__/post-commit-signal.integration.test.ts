import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const signal = vi.fn(async () => {});
vi.mock("@/lib/notifications/outbox-signal", () => ({ signalOutbox: signal }));

const { db } = await import("@/db/client");
const { markOutboxDirty } = await import("../outbox-dirty");

beforeEach(() => signal.mockClear());

describe("db.transaction post-commit outbox signal", () => {
  it("signals once after commit when something was enqueued", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select 1`);
      markOutboxDirty();
      markOutboxDirty();
      expect(signal).not.toHaveBeenCalled();
    });
    expect(signal).toHaveBeenCalledTimes(1);
  });

  it("does not signal when the transaction throws", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        markOutboxDirty();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(signal).not.toHaveBeenCalled();
  });

  it("does not signal after tx.rollback()", async () => {
    await expect(
      db.transaction(async (tx) => {
        markOutboxDirty();
        tx.rollback();
      }),
    ).rejects.toThrow();
    expect(signal).not.toHaveBeenCalled();
  });

  it("does not signal when nothing was enqueued", async () => {
    await db.transaction((tx) => tx.execute(sql`select 1`));
    expect(signal).not.toHaveBeenCalled();
  });

  it("signals once, after the outer commit, for an enqueue inside a savepoint", async () => {
    await db.transaction(async (tx) => {
      await tx.transaction(async (inner) => {
        await inner.execute(sql`select 1`);
        markOutboxDirty();
      });
      expect(signal).not.toHaveBeenCalled();
    });
    expect(signal).toHaveBeenCalledTimes(1);
  });

  it("a failing signal does not fail the committed transaction", async () => {
    signal.mockRejectedValueOnce(new Error("queue down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(db.transaction(async () => { markOutboxDirty(); return 7; })).resolves.toBe(7);
    err.mockRestore();
  });
});
