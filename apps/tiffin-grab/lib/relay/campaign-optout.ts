import { emailViaRelay } from "@/lib/runtime/env";
import { relayRpc } from "./client";

type Row = { channel: string; kind: string; recipientId: bigint | null; recipientEmail: string | null };

/**
 * Opt-outs on mail that Relay sends are recorded only in Relay, so engine campaigns ask it just before
 * each send. A Relay error throws: the row retries rather than mail someone who may have opted out.
 */
export async function relayOptOutRefusal(
  row: Row,
  from: string | undefined,
  loadEmail: (userId: bigint) => Promise<string | null>,
): Promise<string | null> {
  if (!emailViaRelay() || row.channel !== "email" || row.kind !== "marketing") return null;
  const email = row.recipientEmail ?? (row.recipientId === null ? null : await loadEmail(row.recipientId));
  if (!email) return null;
  const blocked = await relayRpc().isSuppressed(email.trim().toLowerCase(), "marketing", from);
  return blocked ? "recipient opted out or is blocked in Relay" : null;
}
