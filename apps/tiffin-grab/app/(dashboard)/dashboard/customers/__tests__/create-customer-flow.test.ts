import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deleteNonSystemUsers, ensureSystemUser } from "@/db/test-helpers";
import { inquiries, users } from "@/db/schema";
import { resetInquiryData } from "@/lib/services/__tests__/helpers/inquiry-fixtures";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/guards", () => ({ requireStaff: async () => undefined, requireAdmin: async () => undefined }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/services/customers.service", async (orig) => ({
  ...(await orig<typeof import("@/lib/services/customers.service")>()),
  sendCustomerInvite: async () => undefined,
}));

const { createCustomerFlow } = await import("../actions");

async function reset() {
  await resetInquiryData();
  await deleteNonSystemUsers();
}

describe("createCustomerFlow", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("links the resolved inquiry to the new customer", async () => {
    const email = `cust-${Math.random().toString(36).slice(2)}@test.invalid`;
    const res = await createCustomerFlow({
      source: { sourceKey: "manual" },
      contact: { fullName: "New Customer", phone: "+16475551501", email },
    });
    expect(res).toMatchObject({ ok: true });
    const data = res as { customerPublicId: string; inquiryId: string };
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, data.customerPublicId));
    const [inq] = await db.select().from(inquiries).where(eq(inquiries.publicId, data.inquiryId));
    expect(inq.customerId).toBe(u.id);
  });
});
