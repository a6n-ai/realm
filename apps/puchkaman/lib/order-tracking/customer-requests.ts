import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog } from "@/db/schema";

export type CustomerRequest = {
  action: "tracking_cancel_requested" | "tracking_note_added";
  text: string | null;
  at: number;
};

const ACTIONS = ["tracking_cancel_requested", "tracking_note_added"] as const;

/**
 * Requests the customer sent from the public tracking page. Read back out of
 * `audit_log` — they were never order state, so there is no column to read.
 */
export async function listCustomerRequests(
  orderPublicId: string,
  limit = 10,
): Promise<CustomerRequest[]> {
  const rows = await db
    .select({ changes: auditLog.changes, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.entity, "orders"), eq(auditLog.entityPublicId, orderPublicId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(50);

  return rows
    .map((r) => {
      const changes = r.changes as Record<string, unknown> | null;
      const action = changes?._action;
      if (typeof action !== "string" || !ACTIONS.includes(action as (typeof ACTIONS)[number])) {
        return null;
      }
      const text = changes?.note ?? changes?.reason;
      return {
        action: action as CustomerRequest["action"],
        text: typeof text === "string" && text ? text : null,
        at: r.createdAt,
      };
    })
    .filter((r): r is CustomerRequest => r !== null)
    .slice(0, limit);
}
