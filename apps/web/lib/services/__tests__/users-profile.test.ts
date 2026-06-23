import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));
const { usersService } = await import("@/lib/services/users.service");

async function reset() {
  await db.delete(users);
}

describe("usersService.updateProfile", () => {
  beforeEach(reset);
  afterAll(reset);

  it("updates name and image without touching contact fields", async () => {
    const [u] = await db.insert(users).values({ phone: "+16475550900", role: "user", name: "Old" }).returning();
    await usersService.updateProfile(u.publicId, { name: "Aanya" });
    let [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.name).toBe("Aanya");
    await usersService.updateProfile(u.publicId, { image: "/uploads/avatars/x.png" });
    [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.image).toBe("/uploads/avatars/x.png");
    expect(row.name).toBe("Aanya");
    expect(row.phone).toBe("+16475550900");
    await usersService.updateProfile(u.publicId, { name: "" });
    [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.name).toBeNull();
  });

  it("rejects name longer than 120 characters", async () => {
    const [u] = await db.insert(users).values({ phone: "+16475550901", role: "user" }).returning();
    await expect(
      usersService.updateProfile(u.publicId, { name: "A".repeat(121) }),
    ).rejects.toThrow("Name is too long");
  });

  it("trims whitespace from name", async () => {
    const [u] = await db.insert(users).values({ phone: "+16475550902", role: "user" }).returning();
    await usersService.updateProfile(u.publicId, { name: "  Priya  " });
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.name).toBe("Priya");
  });

  it("accepts image: null to clear the image", async () => {
    const [u] = await db
      .insert(users)
      .values({ phone: "+16475550903", role: "user", image: "/uploads/avatars/old.png" })
      .returning();
    await usersService.updateProfile(u.publicId, { image: null });
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.image).toBeNull();
  });

  it("does not touch fields absent from input", async () => {
    const [u] = await db
      .insert(users)
      .values({ phone: "+16475550904", role: "member", email: "staff@example.com", name: "Staff" })
      .returning();
    await usersService.updateProfile(u.publicId, { name: "Staff Updated" });
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.email).toBe("staff@example.com");
    expect(row.phone).toBe("+16475550904");
    expect(row.role).toBe("member");
  });
});
