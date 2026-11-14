import { cache } from "react";
import { eq } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { users } from "@/db/schema";

// session.user.id is the acting user's public_id (usr_…); audit columns are
// bigint. Resolve the public_id → users internal bigint once per call so the
// service stamps createdBy/updatedBy with the internal id (null if no session).
// cache(): the shell resolves the same actor 3+ times per render (audit stamp,
// sidebar activity, org switcher); one query per request instead.
export const userIdByPublicId = cache(async (publicId: string): Promise<bigint | null> => {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return row?.id ?? null;
});

/** The user's email by public id, or null. */
export async function emailByPublicId(publicId: string): Promise<string | null> {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.publicId, publicId));
  return row?.email ?? null;
}

/** The internal id for a public id, or a ValidationError("User not found"). */
export async function requireUserId(publicId: string): Promise<bigint> {
  const id = await userIdByPublicId(publicId);
  if (id == null) throw new ValidationError("User not found");
  return id;
}

export async function resolveUserId(
  tx: { select: typeof db.select },
  publicId: string | null | undefined,
): Promise<bigint | null> {
  if (!publicId) return null;
  const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return row?.id ?? null;
}

/** The seeded system user, or null when none is seeded. */
export async function systemUserId(): Promise<bigint | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.isSystem, true)).limit(1);
  return row?.id ?? null;
}
