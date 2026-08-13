import type { RealtimeRole } from "@realm/realtime";
import { getSession } from "@/lib/auth/session";

/** Extract the user public id from a `notify:<publicId>` channel, or null. */
export function parseNotifyChannel(channel: string): string | null {
  const parts = channel.split(":");
  if (parts.length !== 2) return null;
  const [kind, id] = parts;
  if (kind !== "notify" || !id) return null;
  return id;
}

/**
 * A user may subscribe to their OWN notify channel and no other. The channel
 * name contains the target's public id, so without this check any signed-in
 * user could read every other user's live pings.
 */
export async function authorizeChannel(
  channel: string,
): Promise<{ channel: string; userId: string; role: RealtimeRole } | null> {
  const target = parseNotifyChannel(channel);
  if (!target) return null;

  const session = await getSession();
  const publicId = session?.user?.id;
  if (!publicId || publicId !== target) return null;

  return { channel, userId: publicId, role: "staff" };
}
