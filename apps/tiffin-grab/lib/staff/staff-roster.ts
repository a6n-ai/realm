import { and, eq, inArray } from "drizzle-orm";
import { users } from "@/db/schema";
import { STAFF_ROLES } from "@/lib/roles";

// The staff roster: admin/member accounts that are real people (not the system user) and can sign in.
export const activeStaffWhere = () =>
  and(inArray(users.role, STAFF_ROLES), eq(users.isSystem, false), eq(users.status, "active"));
