import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

const guard = { admin: true };
vi.mock("@/lib/auth/guards", async () => {
  const { ForbiddenError } = await import("@foundry/commons");
  return {
    requireAdmin: async () => {
      if (!guard.admin) throw new ForbiddenError("Forbidden");
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/tenant/resolve-request-org", () => ({ resolveRequestOrg: async () => null }));
vi.mock("@foundry/places", async (orig) => ({ ...(await orig<object>()), resolveAndPersist: async () => null }));

const { db } = await import("@/db/client");
const { customerAddresses, users } = await import("@/db/schema");
const { staffCreateAddress, staffArchiveAddress } = await import("../address-actions");

const EMAIL = "staffaddr_customer@test.invalid";
async function reset() {
  await db.delete(users).where(like(users.email, "staffaddr_%")); // cascades addresses
}

describe("staff address actions", () => {
  beforeEach(async () => {
    guard.admin = true;
    await reset();
  });
  afterAll(reset);

  it("an admin adds an address to the viewed customer's book", async () => {
    const [c] = await db.insert(users).values({ email: EMAIL, role: "user" }).returning();
    const saved = await staffCreateAddress(c!.publicId, { addressLine: "9 Bay St", city: "Toronto", postalCode: "M5J 2T3" });
    expect(saved).toMatchObject({ ok: true, isDefault: true });
    const rows = await db.select().from(customerAddresses).where(eq(customerAddresses.userId, c!.id));
    expect(rows.map((r) => r.addressLine)).toEqual(["9 Bay St"]);
  });

  it("non-admins are refused before anything is written", async () => {
    const [c] = await db.insert(users).values({ email: EMAIL, role: "user" }).returning();
    guard.admin = false;
    await expect(staffCreateAddress(c!.publicId, { addressLine: "9 Bay St", city: "Toronto", postalCode: "M5J 2T3" }))
      .resolves.toEqual({ error: "You do not have permission to perform this action." });
    expect(await db.select().from(customerAddresses).where(eq(customerAddresses.userId, c!.id))).toHaveLength(0);
  });

  it("an address can't be archived through another customer's page", async () => {
    const [a] = await db.insert(users).values({ email: "staffaddr_a@test.invalid", role: "user" }).returning();
    const [b] = await db.insert(users).values({ email: "staffaddr_b@test.invalid", role: "user" }).returning();
    const home = (await staffCreateAddress(a!.publicId, { addressLine: "1 A St", city: "Toronto", postalCode: "M5J 2T3" })) as { publicId: string };
    await staffCreateAddress(a!.publicId, { label: "Work", addressLine: "2 A St", city: "Toronto", postalCode: "M5J 2T3" });
    await expect(staffArchiveAddress(b!.publicId, home.publicId)).resolves.toEqual({ error: "Address not found" });
  });
});
