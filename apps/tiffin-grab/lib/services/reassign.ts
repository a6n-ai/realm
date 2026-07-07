import { ForbiddenError } from "@realm/commons";
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
