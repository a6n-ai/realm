import type { UsersRef } from "@realm/notifications";
import { notificationTables, users } from "@/db/schema";

export { notificationTables };

/**
 * No `notifyEmail` column here — that is a tiffin-grab legacy opt-in. Puchkaman
 * expresses the same thing through notification_prefs, which is per-kind and so
 * cannot silence a receipt.
 */
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
