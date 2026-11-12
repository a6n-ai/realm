"use server";

import { ValidationError } from "@foundry/commons";
import { clearSuppression, suppressManually } from "@relay/engine";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { db } from "@/db/client";
import { notificationTables } from "@/lib/notifications/tables";

const OPTS = { guard: "admin", revalidate: ["/dashboard/notifications/unsubscribed"] } as const;

export async function clearSuppressionAction(publicId: string): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    if (!publicId) throw new ValidationError("Not found");
    const result = await clearSuppression(db, notificationTables, publicId);
    if ("error" in result) throw new ValidationError(result.error);
  });
}

export async function suppressManuallyAction(address: string, channel: "email" | "sms"): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    if (channel !== "email" && channel !== "sms") throw new ValidationError("Pick email or SMS");
    const result = await suppressManually(db, notificationTables, { address, channel });
    if ("error" in result) throw new ValidationError(result.error);
  });
}
