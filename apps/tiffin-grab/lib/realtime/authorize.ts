import { isAdmin, isStaffRole } from "@/lib/roles";
import { type RoleValue } from "@foundry/commons";
import type { RealtimeRole } from "@foundry/realtime";
import { getSession } from "@/lib/auth/session";
import { ticketsService } from "@/lib/support/tickets.service";
import { PAYMENTS_INBOX, TICKETS_INBOX } from "./inbox";
import { notifyChannel } from "./notify";

// Resolve the caller and confirm they may use this channel.
// - `notify:<userId>` — that user's bell + shell refresh (personal hub)
// - `ticket:<publicId>` — staff, or the customer who raised it (chat/presence)
// - `tickets:inbox` — staff (new-ticket sidebar ping)
// - `payments:inbox` — admin only (matches Payments nav; review-queue ping)
export async function authorizeChannel(
  channel: string,
): Promise<{ channel: string; userId: string; role: RealtimeRole } | null> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  const role = session.user.role as RoleValue;
  const realtimeRole: RealtimeRole = isStaffRole(role) ? "staff" : "customer";

  const parts = channel.split(":");
  if (parts.length !== 2) return null;
  const [kind, publicId] = parts;
  if (!kind || !publicId) return null;

  if (kind === "notify") {
    return publicId === userId ? { channel: notifyChannel(userId), userId, role: realtimeRole } : null;
  }

  if (kind === "tickets" && publicId === "inbox") {
    if (!isStaffRole(role)) return null;
    return { channel: TICKETS_INBOX, userId, role: "staff" };
  }

  if (kind === "payments" && publicId === "inbox") {
    // Payments nav is admin-only — members must not hold the review stream.
    if (!isAdmin(role)) return null;
    return { channel: PAYMENTS_INBOX, userId, role: "staff" };
  }

  if (kind !== "ticket") return null;

  try {
    await ticketsService.assertReadable(publicId);
  } catch {
    return null;
  }

  // Canonical channel, not the raw request string — callers must subscribe/
  // publish on this so the authorized channel is always the used channel.
  return { channel: `ticket:${publicId}`, userId, role: realtimeRole };
}
