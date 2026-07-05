import { describe, it, expect, vi, beforeEach } from "vitest";

const created: Record<string, unknown>[] = [];
const updated: Record<string, unknown>[] = [];

// recordAudit does a best-effort `db.insert(auditLog).values(...)`; give the
// mock a no-op matching that chain so the audit path succeeds silently instead
// of logging a caught "db.insert is not a function" on every run.
vi.mock("@/db/client", () => ({ db: { insert: () => ({ values: async () => {} }) } }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

vi.mock("@realm/database", async (orig) => {
  const actual = await orig<typeof import("@realm/database")>();
  class FakeBase {
    repo = { tableName: "widgets", findByPublicId: async () => null };
    async create(v: Record<string, unknown>) { created.push(v); return { publicId: "wid_1", ...v }; }
  }
  class FakeUpd extends FakeBase {
    async update(_id: string, v: Record<string, unknown>) { updated.push(v); return { publicId: "wid_1", ...v }; }
    async delete() { return 1; }
  }
  return { ...actual, BaseService: FakeBase, UpdatableService: FakeUpd };
});

import { SessionUpdatableService } from "../session-service";

class Widgets extends SessionUpdatableService<any> {
  protected currentUserId() { return Promise.resolve(42n); }
}

describe("session stamping", () => {
  beforeEach(() => { created.length = 0; updated.length = 0; });

  it("stamps createdBy on create", async () => {
    const svc = new Widgets({ tableName: "widgets" } as any);
    await svc.create({ name: "x" });
    expect(created[0]).toMatchObject({ name: "x", createdBy: 42n });
  });

  it("stamps updatedBy on update", async () => {
    const svc = new Widgets({ tableName: "widgets" } as any);
    await svc.update("wid_1", { name: "y" });
    expect(updated[0]).toMatchObject({ name: "y", updatedBy: 42n });
  });
});
