import { Role, type RoleValue } from "@tiffin/commons";
import { eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { verifyPassword } from "./password";

export interface CredentialUser {
  id: string;
  email: string | null;
  name: string | null;
  role: RoleValue;
}

// Staff sign in with their email, customers with their phone; either resolves
// the same account. Email is matched case-insensitively (stored lower-cased);
// phone is matched as entered.
export async function resolveCredentialUser(identifier: string, password: string): Promise<CredentialUser | null> {
  const id = identifier.trim();
  if (!id || !password) return null;
  const lower = id.toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, lower), eq(users.phone, id)))
    .limit(1);
  if (!user?.passwordHash) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role ?? Role.USER };
}
