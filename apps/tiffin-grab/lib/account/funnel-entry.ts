import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/roles";
import { currentUserId } from "@/lib/services/session-service";

/**
 * Gate for /subscribe and /checkout. Staff can't own an order (createOrder refuses), and a staff
 * invitee who hasn't set a password yet must not browse the customer flow as signed in:
 * /dashboard sends them to /set-password first. Returns the customer's id, or null when signed out.
 */
export async function customerFunnelUserId(): Promise<bigint | null> {
  const session = await getSession();
  if (session?.user && isStaffRole(session.user.role)) redirect("/dashboard");
  return currentUserId();
}
