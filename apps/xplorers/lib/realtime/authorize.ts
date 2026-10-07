import { Role, type RoleValue } from "@foundry/commons";
import type { RealtimeRole } from "@foundry/realtime";
import { getSession } from "@/lib/auth/session";
import { ticketsService } from "@/lib/services/tickets.service";

/** Extract the user public id from a `notify:<publicId>` channel, or null. */
export function parseNotifyChannel(channel: string): string | null {
  const parts = channel.split(":");
  if (parts.length !== 2) return null;
  const [kind, id] = parts;
  if (kind !== "notify" || !id) return null;
  return id;
}

/**
 * Authorize SSE / presence channels:
 * - `notify:<publicId>` — the signed-in user only
 * - `ticket:<publicId>` — staff, or the customer who raised it
 */
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
  if (!kind || !publicId) return null;

  if (kind === "notify") {
    return publicId === userId ? { channel: `notify:${userId}`, userId, role: realtimeRole } : null;
  }

  if (kind !== "ticket") return null;

  try {
    await ticketsService.assertReadable(publicId);
  } catch {
    return null;
  }

  return { channel: `ticket:${publicId}`, userId, role: realtimeRole };
}
