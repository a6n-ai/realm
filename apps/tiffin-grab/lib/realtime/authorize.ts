import { Role, type RoleValue } from "@realm/commons";
import type { RealtimeRole } from "@realm/realtime";
import { getSession } from "@/lib/auth/session";
import { ticketsService } from "@/lib/services/tickets.service";

// Resolve the caller and confirm they may use this channel. Only ticket channels
// exist today: `ticket:<publicId>` — allowed iff the caller can read that ticket
// (staff, or the customer who raised it). Returns null when unauthorized.
export async function authorizeChannel(
  channel: string,
): Promise<{ channel: string; userId: string; role: RealtimeRole } | null> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  const role = session.user.role as RoleValue;
  const realtimeRole: RealtimeRole = role === Role.ADMIN || role === Role.MEMBER ? "staff" : "customer";

  const parts = channel.split(":");
  if (parts.length !== 2) return null;
  const [kind, publicId] = parts;
  if (kind !== "ticket" || !publicId) return null;

  try {
    await ticketsService.assertReadable(publicId);
  } catch {
    return null;
  }

  // Canonical channel, not the raw request string — callers must subscribe/
  // publish on this so the authorized channel is always the used channel.
  return { channel: `${kind}:${publicId}`, userId, role: realtimeRole };
}
