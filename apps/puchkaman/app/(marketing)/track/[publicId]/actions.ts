"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createLogger } from "@realm/commons/logger";
import { auth } from "@/lib/auth";
import { ordersService } from "@/lib/services/orders.service";
import { recordAudit } from "@/lib/services/session-service";

const log = createLogger("order-tracking");

const MAX_NOTE_LENGTH = 500;

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Every action re-checks the grant. The page having rendered proves nothing:
 * a server action is a POST endpoint anyone can call with just the order id,
 * so authorization belongs here, not upstream in the page that linked to it.
 */
async function requireGrant(orderId: string): Promise<boolean> {
  const grant = await auth.api
    .getOrderTrackingGrant({ query: { orderId }, headers: await headers() })
    .catch(() => null);
  return Boolean(grant?.granted);
}

/**
 * Customer-initiated requests land in the audit trail rather than in new
 * columns: `audit_log` already backs /dashboard/logs and admin order detail,
 * and neither "please cancel" nor "leave it at the door" is order state — it
 * is a message about the order that staff act on.
 */
async function recordRequest(
  orderId: string,
  action: "tracking_cancel_requested" | "tracking_note_added",
  changes: Record<string, unknown> = {},
): Promise<void> {
  await recordAudit({
    entity: "orders",
    entityPublicId: orderId,
    operation: "update",
    // createdBy stays null: a guest holding a PIN is not a user, and stamping
    // a staff id here would misattribute the request in the trail.
    createdBy: null,
    changes: { _action: action, ...changes },
  });
}

export async function requestCancel(orderId: string, reason: string): Promise<ActionResult> {
  if (!(await requireGrant(orderId))) return { ok: false, error: "Not authorized." };

  await recordRequest(orderId, "tracking_cancel_requested", {
    reason: reason.trim().slice(0, MAX_NOTE_LENGTH) || null,
  });
  revalidatePath(`/track/${orderId}`);
  return { ok: true };
}

export async function addNote(orderId: string, note: string): Promise<ActionResult> {
  if (!(await requireGrant(orderId))) return { ok: false, error: "Not authorized." };

  const text = note.trim().slice(0, MAX_NOTE_LENGTH);
  if (!text) return { ok: false, error: "Write something first." };

  await recordRequest(orderId, "tracking_note_added", { note: text });
  revalidatePath(`/track/${orderId}`);
  return { ok: true };
}

/** Customer-triggered refresh of this one order's payment status from Clover. */
export async function checkPaymentStatus(
  orderId: string,
): Promise<{ ok: true; orderStatus: string; changed: boolean } | { ok: false; error: string }> {
  if (!(await requireGrant(orderId))) return { ok: false, error: "Not authorized." };

  try {
    const result = await ordersService.checkPaymentStatus(orderId);
    revalidatePath(`/track/${orderId}`);
    return { ok: true, orderStatus: result.orderStatus, changed: result.changed };
  } catch (err) {
    log.error({ err, orderId }, "tracking payment status check failed");
    return { ok: false, error: "Couldn't check payment status right now." };
  }
}

/** Public PAKMS key + SDK URL so the customer can pay an outstanding balance. */
export async function getPaymentConfig(
  orderId: string,
): Promise<{ ok: true; pakmsKey: string; sdkUrl: string } | { ok: false; error: string }> {
  if (!(await requireGrant(orderId))) return { ok: false, error: "Not authorized." };

  try {
    const cfg = await ordersService.getPaymentIframeConfig(orderId);
    return { ok: true, pakmsKey: cfg.pakmsKey, sdkUrl: cfg.checkoutSdkUrl };
  } catch (err) {
    // Server Actions must RETURN errors: a thrown one reaches the client as an
    // opaque digest, which is indistinguishable from a crash.
    log.error({ err, orderId }, "tracking payment config failed");
    return { ok: false, error: "Card payment is unavailable right now." };
  }
}
