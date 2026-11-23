import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { users } = await import("@/db/schema");
const { usersService } = await import("@/lib/services/users.service");
const { listAssignableStaff, invalidateAssignableStaff } = await import("../assignable-staff");

const EMAIL = "assignable-cache-test@example.invalid";

describe("assignable staff cache", () => {
  afterAll(async () => {
    await db.delete(users).where(eq(users.email, EMAIL));
    await invalidateAssignableStaff();
  });

  it("shows a renamed staff member on the next read", async () => {
    await db.insert(users).values({ name: "Cache Before", email: EMAIL, role: "admin", status: "active" });
    await invalidateAssignableStaff();
    const [row] = await db.select({ publicId: users.publicId }).from(users).where(eq(users.email, EMAIL)).limit(1);
    expect((await listAssignableStaff()).find((s) => s.publicId === row!.publicId)?.name).toBe("Cache Before");
    await usersService.update(row!.publicId, { name: "Cache After" });
    expect((await listAssignableStaff()).find((s) => s.publicId === row!.publicId)?.name).toBe("Cache After");
  });
});
