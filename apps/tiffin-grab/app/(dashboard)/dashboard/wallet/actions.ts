"use server";

import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { parseInput, staffAction } from "@/lib/actions/staff-action";
import type { ActionResult } from "@/lib/actions/action-result";
import { currentUserId } from "@/lib/services/session-service";
import { awardCustomerBroadcast } from "@/lib/services/customer-payouts.service";

const broadcastSchema = z.object({
  userPublicIds: z.array(z.string().trim().min(1)).min(1),
  coins: z.number().int().min(0),
  memo: z.string().trim().max(200).optional(),
});

export type CustomerBroadcastResult = { awarded: number; coinsPerCustomer: number; capped: number };

export async function broadcastCustomerPayout(input: unknown): Promise<ActionResult<CustomerBroadcastResult>> {
  return staffAction({ guard: "admin", revalidate: [["/dashboard/wallet", "layout"]] }, async () => {
    const data = parseInput(broadcastSchema, input);
    const rows = await db.select({ id: users.id }).from(users).where(inArray(users.publicId, data.userPublicIds));
    return awardCustomerBroadcast(rows.map((r) => r.id), data.coins, data.memo, await currentUserId());
  });
}
