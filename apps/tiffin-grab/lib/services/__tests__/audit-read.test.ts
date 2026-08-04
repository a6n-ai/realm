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
vi.mock("@realm/database", async (orig) => {
  const actual = await orig<typeof import("@realm/database")>();
  class FakeBase {
    repo = { tableName: "secrets" };
    async read(id: string) { return { publicId: id, secret: "x" }; }
  }
  return { ...actual, BaseService: FakeBase };
});

import { SessionBaseService } from "../session-service";

// The base class is mocked above, so only `tableName` is ever touched. This stands in
// for the repository the real constructor wants without rebuilding a drizzle table.
type FakeRepo = ConstructorParameters<typeof SessionBaseService<PgTable>>[0];
const fakeRepo = (tableName: string) => ({ tableName }) as unknown as FakeRepo;

class SensitiveSvc extends SessionBaseService<PgTable> {
  protected sensitive = true;
  protected currentUserId() { return Promise.resolve(7n); }
}
class PlainSvc extends SessionBaseService<PgTable> {
  protected currentUserId() { return Promise.resolve(7n); }
}

describe("sensitive read audit", () => {
  beforeEach(() => { auditRows.length = 0; });

  it("logs read when sensitive", async () => {
    await new SensitiveSvc(fakeRepo("secrets")).read("sec_1");
    expect(auditRows[0]).toMatchObject({ operation: "read", entityPublicId: "sec_1", createdBy: 7n });
  });

  it("does not log read when not sensitive", async () => {
    await new PlainSvc(fakeRepo("secrets")).read("sec_1");
    expect(auditRows).toHaveLength(0);
  });
});
