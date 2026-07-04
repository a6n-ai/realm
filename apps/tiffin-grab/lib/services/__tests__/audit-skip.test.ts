import { describe, it, expect, vi, beforeEach } from "vitest";

const auditRows: Record<string, unknown>[] = [];
vi.mock("@/db/client", () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        auditRows.push(v);
        return Promise.resolve();
      },
    }),
  },
}));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/services/audit-config", () => ({ AUDIT_UPDATE_SKIP: new Set(["sessions"]) }));
vi.mock("@realm/commons-drizzle", async (orig) => {
  const actual = await orig<typeof import("@realm/commons-drizzle")>();
  class FakeBase {
    repo: any;
    constructor(repo?: any) { this.repo = repo ?? { tableName: "x" }; }
  }
  class FakeUpd extends FakeBase {
    async update(id: string, v: Record<string, unknown>) { return { publicId: id, ...v }; }
  }
  return { ...actual, BaseService: FakeBase, UpdatableService: FakeUpd };
});

import { SessionUpdatableService } from "../session-service";

class Skipped extends SessionUpdatableService<any> {
  protected currentUserId() { return Promise.resolve(1n); }
}

describe("audit update skip registry", () => {
  beforeEach(() => { auditRows.length = 0; });

  it("writes no audit row for a skipped table", async () => {
    const svc = new Skipped({ tableName: "sessions", findByPublicId: async () => ({ name: "a" }) } as any);
    await svc.update("ss_1", { name: "b" });
    expect(auditRows).toHaveLength(0);
  });

  it("still writes audit for a non-skipped table", async () => {
    const svc = new Skipped({ tableName: "widgets", findByPublicId: async () => ({ name: "a" }) } as any);
    await svc.update("wid_1", { name: "b" });
    expect(auditRows).toHaveLength(1);
  });
});
