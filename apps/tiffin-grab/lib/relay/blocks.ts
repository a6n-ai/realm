import { suppressionKind } from "@relay/engine";
import type { Tx } from "@/db/client";
import { relayBlockQueue } from "@/db/schema";
import type { RelayBlockImportRow, RelayBlockReason } from "./client";

export function toRelayReason(reason: string): RelayBlockReason {
  const kind = suppressionKind(reason);
  return kind === "other" ? "manual" : kind;
}

/** Call inside the transaction that writes the local block, then signalOutbox() after it commits. */
export async function queueBlock(tx: Tx, event: RelayBlockImportRow): Promise<void> {
  await tx.insert(relayBlockQueue).values({ ...event, email: event.email.trim().toLowerCase() });
}
