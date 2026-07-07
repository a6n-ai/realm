import { and, eq, inArray } from "drizzle-orm";
import { ForbiddenError, ValidationError } from "@realm/commons";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { hasFlag } from "@/lib/flags";

export const REASSIGN_FLAG = "reassign_records";

export async function canReassign(): Promise<boolean> {
  const publicId = (await getSession())?.user?.id;
  if (!publicId) return false;
  return hasFlag(publicId, REASSIGN_FLAG);
}

export async function assertReassignAllowed(): Promise<void> {
  if (!(await canReassign())) throw new ForbiddenError("Reassignment is not enabled for this account");
}

// Resolves a new-owner candidate by public_id, restricted to real staff
// accounts (admin/member, non-system) — a bare publicId lookup would let a
// flagged caller set a customer or system account as owner.
export async function resolveAssignableOwner(
  ownerPublicId: string,
): Promise<{ id: bigint; name: string }> {
  const [owner] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      and(
        eq(users.publicId, ownerPublicId),
        eq(users.isSystem, false),
        inArray(users.role, ["admin", "member"]),
      ),
    )
    .limit(1);
  if (!owner) throw new ValidationError("Unknown or ineligible owner");
  return { id: owner.id, name: owner.name ?? "Staff" };
}
