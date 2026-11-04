import { scheduleCampaignWake } from "@/lib/runtime/workflow-wake";

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
  const [scheduledAt, pendingAt] = await Promise.all([computeNotifyNextAt(), earliestPendingAt()]);
  const next = [scheduledAt, pendingAt].filter((t): t is number => t != null);
  if (next.length) await scheduleCampaignWake(Math.min(...next));
  // The Queue consumer re-delivers its message after this when rows are left pending.
  const retryAfterMs = pendingAt == null ? null : Math.max(0, pendingAt - Date.now());
  return { materialized, processed, retryAfterMs };
}
