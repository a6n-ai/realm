import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export async function listAssignableStaff(): Promise<{ publicId: string; name: string }[]> {
  const rows = await db
    .select({ publicId: users.publicId, name: users.name })
    .from(users)
    .where(and(inArray(users.role, ["admin", "member"]), eq(users.isSystem, false)))
    .orderBy(asc(users.name));

  return rows.map((r) => ({ publicId: r.publicId, name: r.name ?? "Staff" }));
}
