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
vi.mock("@realm/database", async (orig) => {
  const actual = await orig<typeof import("@realm/database")>();
  class FakeBase {
    repo = { tableName: "secrets" };
    async read(id: string) { return { publicId: id, secret: "x" }; }
  }
  return { ...actual, BaseService: FakeBase };
});

import { SessionBaseService } from "../session-service";

class SensitiveSvc extends SessionBaseService<any> {
  protected sensitive = true;
  protected currentUserId() { return Promise.resolve(7n); }
}
class PlainSvc extends SessionBaseService<any> {
  protected currentUserId() { return Promise.resolve(7n); }
}

describe("sensitive read audit", () => {
  beforeEach(() => { auditRows.length = 0; });

  it("logs read when sensitive", async () => {
    await new SensitiveSvc({ tableName: "secrets" } as any).read("sec_1");
    expect(auditRows[0]).toMatchObject({ operation: "read", entityPublicId: "sec_1", createdBy: 7n });
  });

  it("does not log read when not sensitive", async () => {
    await new PlainSvc({ tableName: "secrets" } as any).read("sec_1");
    expect(auditRows).toHaveLength(0);
  });
});
