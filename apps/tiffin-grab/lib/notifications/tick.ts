import { scheduleCampaignWake } from "@/lib/runtime/workflow-wake";
import { emailViaRelay } from "@/lib/runtime/env";

/**
 * One notifications tick (Queue consumer and CampaignWake Workflow): expand due campaigns, drain the outbox,
 * then chain the next wake for whichever comes first: the earliest scheduled campaign or the earliest row
 * still pending (a campaign bigger than one tick's budget, or a send awaiting retry). The wake helper keeps
 * it at least a minute out. Recurring/system campaigns have no schedule in code; they send via signalOutbox.
 */
export async function runTick() {
  const { drainPending, materializeDue } = await import("@/lib/notifications/drain");
  const { computeNotifyNextAt, earliestPendingAt } = await import("@/lib/notifications/notify-next");
  const materialized = await materializeDue();
  const processed = await drainPending();
  if (emailViaRelay()) await (await import("@/lib/relay/suppression-sync")).syncSuppressionsToRelay();
  const relay = emailViaRelay() ? await (await import("@/lib/relay/forward")).forwardRelayOutbox() : null;
  const [scheduledAt, pendingAt] = await Promise.all([computeNotifyNextAt(), earliestPendingAt()]);
  const relayAt = relay?.retryAfterMs == null ? null : Date.now() + relay.retryAfterMs;
  const next = [scheduledAt, pendingAt, relayAt].filter((t): t is number => t != null);
  if (next.length) await scheduleCampaignWake(Math.min(...next));
  // The Queue consumer re-delivers its message after this when rows are left pending.
  const due = [pendingAt, relayAt].filter((t): t is number => t != null);
  const retryAfterMs = due.length ? Math.max(0, Math.min(...due) - Date.now()) : null;
  return { materialized, processed, retryAfterMs };
}
