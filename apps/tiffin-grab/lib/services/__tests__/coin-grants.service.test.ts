import { describe, expect, it, vi } from "vitest";

const ALL = Array.from({ length: 5 }, (_, i) => ({ publicId: `g${i}` }));

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => {
  const select = (cols: unknown) => {
    const state = { limit: 0, offset: 0 };
    const q: Record<string, unknown> = {
      from: () => q,
      leftJoin: () => q,
      orderBy: () => q,
      limit: (n: number) => ((state.limit = n), q),
      offset: (n: number) => ((state.offset = n), q),
      then: (res: (v: unknown) => void) =>
        res(
          state.limit
            ? ALL.slice(state.offset, state.offset + state.limit)
            : [{ n: ALL.length }],
        ),
    };
    void cols;
    return q;
  };
  return { db: { select } };
});
vi.mock("@relay/engine", () => ({ addContactListMembers: vi.fn(), createContactList: vi.fn() }));
vi.mock("@/lib/campaigns/segment", () => ({ resolveSegment: vi.fn() }));
vi.mock("@/lib/notifications/tables", () => ({ notificationTables: {}, usersRef: {} }));
vi.mock("../wallet.service", () => ({ walletService: {} }));

import { listCoinGrantGroups } from "../coin-grants.service";

describe("listCoinGrantGroups paging", () => {
  it("is 0-indexed: page 0 and page 1 return different groups", async () => {
    const p0 = await listCoinGrantGroups({ page: 0, size: 2 });
    const p1 = await listCoinGrantGroups({ page: 1, size: 2 });
    const p2 = await listCoinGrantGroups({ page: 2, size: 2 });
    expect(p0.rows.map((r) => r.publicId)).toEqual(["g0", "g1"]);
    expect(p1.rows.map((r) => r.publicId)).toEqual(["g2", "g3"]);
    expect(p2.rows.map((r) => r.publicId)).toEqual(["g4"]);
    expect(p0.total).toBe(5);
  });
});
