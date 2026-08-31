import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PgTable } from "drizzle-orm/pg-core";

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
vi.mock("@foundry/database", async (orig) => {
  const actual = await orig<typeof import("@foundry/database")>();
  class FakeBase {
    repo: { tableName: string };
    constructor(repo?: { tableName: string }) { this.repo = repo ?? { tableName: "x" }; }
  }
  class FakeUpd extends FakeBase {
    async update(id: string, v: Record<string, unknown>) { return { publicId: id, ...v }; }
  }
  return { ...actual, BaseService: FakeBase, UpdatableService: FakeUpd };
});

import { SessionUpdatableService } from "../session-service";

// The base class is mocked above, so only `tableName` and `findByPublicId` are used.
type FakeRepo = ConstructorParameters<typeof SessionUpdatableService<PgTable>>[0];
const fakeRepo = (tableName: string) =>
  ({ tableName, findByPublicId: async () => ({ name: "a" }) }) as unknown as FakeRepo;

class Skipped extends SessionUpdatableService<PgTable> {
  protected currentUserId() { return Promise.resolve(1n); }
}

describe("audit update skip registry", () => {
  beforeEach(() => { auditRows.length = 0; });

  it("writes no audit row for a skipped table", async () => {
    const svc = new Skipped(fakeRepo("sessions"));
    await svc.update("ss_1", { name: "b" });
    expect(auditRows).toHaveLength(0);
  });

  it("still writes audit for a non-skipped table", async () => {
    const svc = new Skipped(fakeRepo("widgets"));
    await svc.update("wid_1", { name: "b" });
    expect(auditRows).toHaveLength(1);
  });
});
