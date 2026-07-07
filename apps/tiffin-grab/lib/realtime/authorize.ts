import { Role, type RoleValue } from "@realm/commons";
import type { RealtimeRole } from "@realm/realtime";
import { getSession } from "@/lib/auth/session";
import { ticketsService } from "@/lib/services/tickets.service";

// Resolve the caller and confirm they may use this channel. Only ticket channels
// exist today: `ticket:<publicId>` — allowed iff the caller can read that ticket
// (staff, or the customer who raised it). Returns null when unauthorized.
export async function authorizeChannel(
  channel: string,
): Promise<{ userId: string; role: RealtimeRole } | null> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  const role = session.user.role as RoleValue;
  const realtimeRole: RealtimeRole = role === Role.ADMIN || role === Role.MEMBER ? "staff" : "customer";

  const [kind, publicId] = channel.split(":");
  if (kind !== "ticket" || !publicId) return null;

  try {
    // read() + the service's own access assertion; listMessages throws for a
    // customer who doesn't own the ticket. Reuse it as the read gate.
    await ticketsService.listMessages(publicId);
  } catch {
    return null;
  }

  return { userId, role: realtimeRole };
}
