"use server";

import { parseIsoDate } from "@/lib/dates/iso-date";
import { NotFoundError, ValidationError } from "@foundry/commons";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { createLogger } from "@foundry/commons/logger";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { currentUserId } from "@/lib/services/session-service";
import {
  pushDay,
  removeStops,
  pushOneDelivery,
  removeOneDelivery,
  getDeliveryActivities,
  type PushResult,
  type RemoveResult,
  type DeliveryActivity,
} from "@/lib/services/optimoroute/push";
import { pullRoutes, type PullResult } from "@/lib/services/optimoroute/pull";
import { pullCompletions, type PullCompletionsResult } from "@/lib/services/optimoroute/completions";
import { assignDriver } from "@/lib/services/optimoroute/drivers";

const log = createLogger("dispatch.actions");

const DISPATCH = "/dashboard/dispatch";

function requireDate(date: string): void {
  if (parseIsoDate(date) == null) throw new ValidationError("A YYYY-MM-DD date is required");
}

/**
 * OptimoRoute orderNos are delivery public ids. Each must be a delivery in the caller's franchises;
 * a stop naming none of our deliveries can only be touched by a viewer who sees every franchise.
 */
async function assertDispatchOrders(orderNos: readonly string[]): Promise<void> {
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  if (visible === "all" || orderNos.length === 0) return;
  const rows = await db
    .select({ publicId: deliveries.publicId, org: orders.organizationId })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .where(inArray(deliveries.publicId, [...orderNos]));
  const orgOf = new Map(rows.map((r) => [r.publicId, r.org]));
  for (const no of orderNos) {
    const org = orgOf.get(no);
    if (org == null || !visible.includes(org)) throw new NotFoundError("Delivery not found");
  }
}

/** The caller's own deliveries on `date`, or undefined when they see every franchise. */
async function ownDeliveriesOn(date: string): Promise<string[] | undefined> {
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  if (visible === "all") return undefined;
  if (visible.length === 0) return [];
  const rows = await db
    .select({ publicId: deliveries.publicId })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .where(and(eq(deliveries.deliveryDate, date), inArray(orders.organizationId, visible)));
  return rows.map((r) => r.publicId);
}

/**
 * Best effort: the work already succeeded on OptimoRoute, so a failed pull only leaves stale
 * driver fields until the next pull. It is logged, never reported as a failure.
 */
async function pullAfter(date: string): Promise<void> {
  try {
    await pullRoutes(date);
  } catch (e) {
    log.error({ err: e, date }, "pullRoutes after dispatch action failed");
  }
}

/**
 * Sends the day's stops to OptimoRoute. Staff-only and idempotent — re-running after a
 * partial failure re-sends everything, which OptimoRoute treats as a no-op for stops that
 * already match.
 */
export async function pushDayAction(date: string): Promise<ActionResult<PushResult>> {
  // The Overview's route-push tile and the header badge read the same push status.
  return staffAction({ guard: "staff", revalidate: [DISPATCH, ["/dashboard", "layout"]] }, async () => {
    requireDate(date);
    return pushDay(date, await currentUserId(), await ownDeliveriesOn(date));
  });
}

/**
 * Pushes only the named deliveries — the Dispatch rows with no driver yet — then pulls so
 * any that OptimoRoute already routed show their driver.
 */
export async function pushUnassignedAction(date: string, orderNos: string[]): Promise<ActionResult<PushResult>> {
  return staffAction({ guard: "staff", revalidate: [DISPATCH] }, async () => {
    requireDate(date);
    if (orderNos.length === 0) throw new ValidationError("No unassigned deliveries to push");
    await assertDispatchOrders(orderNos);
    const out = await pushDay(date, await currentUserId(), orderNos);
    await pullAfter(date);
    return out;
  });
}

/**
 * Removes stops from OptimoRoute. Destructive, so the caller must name the exact stops —
 * there is no "remove everything stale" call. removeStops re-checks staleness against a
 * fresh read before deleting anything, so a stop that went live again is skipped.
 */
export async function removeStopsAction(date: string, orderNos: string[]): Promise<ActionResult<RemoveResult>> {
  return staffAction({ guard: "staff", revalidate: [DISPATCH] }, async () => {
    requireDate(date);
    if (orderNos.length === 0) throw new ValidationError("Select at least one stop to remove");
    await assertDispatchOrders(orderNos);
    return removeStops(date, orderNos, await currentUserId());
  });
}

/**
 * Reads OptimoRoute's planned routes back onto our deliveries. Safe to re-run: it
 * overwrites assignments and clears any that no longer appear on a route.
 */
export async function pullRoutesAction(date: string): Promise<ActionResult<PullResult>> {
  // Labels print in driver-then-stop order, so they change the moment routes land.
  return staffAction({ guard: "staff", revalidate: [DISPATCH, "/dashboard/labels"] }, async () => {
    requireDate(date);
    return pullRoutes(date);
  });
}

/**
 * Reads OptimoRoute's proof-of-delivery status back for the date. A "success" stop only
 * records confirmation; a "failed" stop calls the same skipDelivery() a dispatcher would use
 * by hand, pooling the tiffin. Safe to re-run — matching and the skip itself are idempotent.
 */
export async function pullCompletionsAction(date: string): Promise<ActionResult<PullCompletionsResult>> {
  return staffAction({ guard: "staff", revalidate: [DISPATCH, "/dashboard/orders", ["/me", "layout"]] }, async () => {
    requireDate(date);
    return pullCompletions(date, await currentUserId());
  });
}

/** Reassigns a stop to a different driver; assignDriver throws if the order has no planned delivery for that date. */
export async function reassignDriverAction(orderNo: string, date: string, driverSerial: string): Promise<ActionResult> {
  return staffAction({ guard: "staff", revalidate: [DISPATCH] }, async () => {
    requireDate(date);
    await assertDispatchOrders([orderNo]);
    await assignDriver(orderNo, date, driverSerial, await currentUserId());
    await pullAfter(date);
  });
}

/** Manual "redo the push" for one delivery, from the Dispatch table's own row actions. */
export async function pushDeliveryAction(orderNo: string, date: string): Promise<ActionResult> {
  return staffAction({ guard: "staff", revalidate: [DISPATCH] }, async () => {
    requireDate(date);
    await assertDispatchOrders([orderNo]);
    await pushOneDelivery(orderNo, date, await currentUserId());
    await pullAfter(date);
  });
}

/** Read-only push/pull activity log for one delivery — the Dispatch row-click history drawer. */
export async function getDeliveryActivitiesAction(orderNo: string): Promise<ActionResult<{ activities: DeliveryActivity[] }>> {
  return staffAction({ guard: "staff" }, async () => {
    await assertDispatchOrders([orderNo]);
    return { activities: await getDeliveryActivities(orderNo) };
  });
}

/** Manual per-row removal from the Dispatch table — force-removes regardless of the day-level stale check. */
export async function removeDeliveryAction(orderNo: string, date: string): Promise<ActionResult> {
  return staffAction({ guard: "staff", revalidate: [DISPATCH] }, async () => {
    requireDate(date);
    await assertDispatchOrders([orderNo]);
    await removeOneDelivery(orderNo, date, await currentUserId());
    await pullAfter(date);
  });
}
