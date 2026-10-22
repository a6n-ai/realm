// Why a delivery is (or is not) on today's OptimoRoute route, in the words a dispatcher
// uses. Pure: the Day ledger, its counts and its filters all come from this one answer.

export type ReasonGroup = "on_route" | "done" | "needs_action" | "cleanup" | "not_today" | "not_ours";
export type LedgerAction = "send" | "remove" | "review";
export type Reason = { group: ReasonGroup; text: string; action?: LedgerAction };

export type OurSide = {
  status: "scheduled" | "paused" | "skipped" | "cancelled";
  optimoCompletionStatus: string | null;
  optimoCompletionNote: string | null;
  /** Delivery date of the trip this row was merged into, when it was. */
  mergedIntoDate: string | null;
  /** A make-up row was created from this one, so its tiffins live elsewhere. */
  moved: boolean;
  /** A route_pushed activity exists for this delivery. */
  everPushed: boolean;
  /** Once the day is over: whether the Missed deliveries tab counts this row. Null while the day is open. */
  missed?: boolean | null;
};

export type OptimoSide = {
  status: "success" | "failed" | "rejected" | "scheduled" | "unscheduled" | null;
  driver: string | null;
  stopNumber: number | null;
  matchedBy: "orderNo" | "phone";
} | null;

export const GROUP_LABEL: Record<ReasonGroup, string> = {
  on_route: "On route",
  done: "Done",
  needs_action: "Needs action",
  cleanup: "Clean up OptimoRoute",
  not_today: "Not going today",
  not_ours: "Not ours",
};

const HERE: Record<Exclude<OurSide["status"], "scheduled">, string> = {
  skipped: "On hold",
  paused: "Paused",
  cancelled: "Cancelled",
};

export function reconcileReason(ours: OurSide, optimo: OptimoSide): Reason {
  const reason = openDayReason(ours, optimo);
  // A past day's Needs action is exactly the Missed deliveries tab: a stop a driver never closed
  // (T-Stash never marks delivered) is owed, not on route; an unpulled success is not recorded yet.
  if (ours.status !== "scheduled" || ours.missed == null || reason.group === "cleanup") return reason;
  if (ours.missed) {
    if (reason.group === "needs_action") return reason;
    return {
      group: "needs_action",
      text: reason.group === "on_route" ? `Not marked delivered — ${reason.text}` : reason.text,
      action: "review",
    };
  }
  return reason.group === "needs_action" ? { group: "done", text: "Nothing owed — made up or no tiffins" } : reason;
}

function openDayReason(ours: OurSide, optimo: OptimoSide): Reason {
  const closed = optimo?.status === "success" || optimo?.status === "failed";

  if (ours.status !== "scheduled") {
    if (optimo && !closed) {
      return { group: "cleanup", text: `Stale — on OptimoRoute but ${HERE[ours.status]} here`, action: "remove" };
    }
    if (ours.mergedIntoDate) return { group: "not_today", text: `Merged into the ${ours.mergedIntoDate} trip` };
    if (ours.moved) return { group: "not_today", text: "Moved to a make-up day" };
    if (ours.status === "skipped" && ours.optimoCompletionStatus === "failed") {
      return { group: "done", text: ours.optimoCompletionNote ? `Not delivered — ${ours.optimoCompletionNote}` : "Not delivered" };
    }
    return { group: "not_today", text: HERE[ours.status] };
  }

  if (ours.mergedIntoDate) {
    if (optimo && !closed) {
      return { group: "cleanup", text: `Merged into the ${ours.mergedIntoDate} trip but still on OptimoRoute`, action: "review" };
    }
    return { group: "not_today", text: `Merged into the ${ours.mergedIntoDate} trip` };
  }
  if (ours.optimoCompletionStatus === "success") return { group: "done", text: "Delivered" };

  if (!optimo) {
    return ours.everPushed
      ? { group: "needs_action", text: "Was sent, no longer on OptimoRoute", action: "send" }
      : { group: "needs_action", text: "Not sent to OptimoRoute yet", action: "send" };
  }
  if (optimo.status === "success") return { group: "done", text: "Delivered on OptimoRoute — not recorded yet" };
  if (optimo.status === "failed") return { group: "done", text: "Not delivered (driver reported failed)" };
  if (optimo.status === "rejected") return { group: "needs_action", text: "Rejected by driver", action: "review" };
  if (optimo.status === "unscheduled" || !optimo.driver) {
    return { group: "needs_action", text: "Sent, not planned on a route", action: "review" };
  }
  const planned = `Planned — ${optimo.driver}, stop ${optimo.stopNumber ?? "?"}`;
  return { group: "on_route", text: optimo.matchedBy === "phone" ? `${planned} (matched by phone)` : planned };
}
