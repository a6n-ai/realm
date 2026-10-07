import type { UsersRef } from "@relay/engine";
import { notificationTables, users } from "@/db/schema";

export { notificationTables };

export const usersRef: UsersRef = {
  table: users,
  columns: {
    id: users.id,
    email: users.email,
    role: users.role,
    status: users.status,
    phone: users.phone,
  },
};
