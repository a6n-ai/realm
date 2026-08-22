import type { UsersRef } from "@realm/notifications";
import { notificationTables, users } from "@/db/schema";

export { notificationTables };

/**
 * The app's users table, narrowed to what the package reads. `notifyEmail` is
 * tiffin-grab-only — puchkaman has no such column and passes it undefined.
 */
export const usersRef: UsersRef = {
  table: users,
  columns: {
    id: users.id,
    email: users.email,
    role: users.role,
    status: users.status,
    notifyEmail: users.notifyEmail,
    phone: users.phone,
  },
};
