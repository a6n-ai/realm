import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { like } from "drizzle-orm";

const session: { user: { id: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/tenant/resolve-request-org", () => ({ resolveRequestOrg: async () => null }));
vi.mock("@foundry/places", async (orig) => ({ ...(await orig<object>()), resolveAndPersist: async () => null }));

const { db } = await import("@/db/client");
const { users } = await import("@/db/schema");
const { createMyAddress, archiveMyAddress } = await import("../address-actions");

const reset = () => db.delete(users).where(like(users.email, "acctaddr_%")); // cascades addresses

// Production builds redact errors thrown from server actions; expected refusals must come
// back as { error } so the customer sees the real reason (see app/(customer)/me/action-result.ts).
describe("account address actions return refusals, never throw", () => {
  beforeEach(async () => {
    await reset();
    const [u] = await db.insert(users).values({ email: "acctaddr_a@test.invalid", role: "user" }).returning();
    session.user = { id: u!.publicId };
  });
  afterAll(reset);

  it("saves and returns the address", async () => {
    const r = await createMyAddress({ addressLine: "1 A St", city: "Toronto", postalCode: "M5J 2T3" });
    expect(r).toMatchObject({ ok: true, label: "Home", isDefault: true });
  });

  it("a duplicate label comes back as { error }", async () => {
    await createMyAddress({ label: "Home", addressLine: "1 A St", city: "Toronto", postalCode: "M5J 2T3" });
    await expect(createMyAddress({ label: "home", addressLine: "2 A St", city: "Toronto", postalCode: "M5J 2T3" }))
      .resolves.toEqual({ error: 'You already have an address called "home"' });
  });

  it("archiving the default comes back as { error }", async () => {
    const home = await createMyAddress({ addressLine: "1 A St", city: "Toronto", postalCode: "M5J 2T3" });
    await createMyAddress({ label: "Work", addressLine: "2 A St", city: "Toronto", postalCode: "M5J 2T3" });
    await expect(archiveMyAddress((home as { publicId: string }).publicId)).resolves.toEqual({ error: "Make another address the default first" });
  });
});
