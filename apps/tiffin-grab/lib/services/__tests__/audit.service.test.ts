import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

// recordAudit logs failures through pino (createLogger → stdout via fd 1), which
// no console/stdout spy can catch. Mock the logger so its `.error` is assertable.
const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock("@realm/commons/logger", () => {
  const stub = {
    error: logError,
    info: () => {}, warn: () => {}, debug: () => {}, trace: () => {}, fatal: () => {},
    child: () => stub,
  };
  return { createLogger: () => stub, loggerOptions: {} };
});

const { db } = await import("@/db/client");
const { auditLog, inquiries, inquiryActivities } = await import("@/db/schema");
const { inquiriesService } = await import("../inquiries.service");
const { recordAudit } = await import("../session-service");

async function reset() {
  await db.delete(auditLog);
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
}

describe("audit logging via the intermediate layer (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("writes a create audit row when a service creates an entity", async () => {
    const inq = await inquiriesService.create({ fullName: "Aud Test", phone: "+16475550000", sourceKey: "manual" });
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityPublicId, inq.publicId));
    const created = rows.find((r) => r.operation === "create");
    expect(created).toBeTruthy();
    expect(created!.entity).toBe("inquiries");
    expect((created!.changes as Record<string, unknown>).fullName).toBe("Aud Test");
  });

  it("writes an update audit row when a service updates an entity", async () => {
    const inq = await inquiriesService.create({ fullName: "Up Test", phone: "+16475550001", sourceKey: "manual" });
    await db.delete(auditLog);
    await inquiriesService.changeStage(inq.publicId, "contacted");
    const updates = await db.select().from(auditLog)
      .where(eq(auditLog.entityPublicId, inq.publicId));
    expect(updates.some((r) => r.operation === "update")).toBe(true);
  });

  it("recordAudit is best-effort: a failing insert does not throw", async () => {
    logError.mockClear();
    // entity violates NOT NULL → insert fails → must be swallowed + logged.
    await expect(
      recordAudit({ entity: null as unknown as string, entityPublicId: "x", operation: "create", changes: null, createdBy: null }),
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
  });
});
