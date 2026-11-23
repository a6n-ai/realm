import { activeStaffWhere } from "@/lib/staff/staff-roster";
import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { configCache } from "@/lib/cache";

// Owner pickers read the roster on every inquiry and order page. Every users write that can change
// role, status, name or system flag evicts it (see users.service and the Better Auth user hooks).
const staffCache = configCache("assignable-staff");

export async function invalidateAssignableStaff(): Promise<void> {
  await staffCache.evictAll();
}

export function listAssignableStaff(): Promise<{ publicId: string; name: string }[]> {
  return staffCache.getOrSet("all", async () => {
    const rows = await db
      .select({ publicId: users.publicId, name: users.name })
      .from(users)
      .where(activeStaffWhere())
      .orderBy(asc(users.name));

    return rows.map((r) => ({ publicId: r.publicId, name: r.name ?? "Staff" }));
  });
}
