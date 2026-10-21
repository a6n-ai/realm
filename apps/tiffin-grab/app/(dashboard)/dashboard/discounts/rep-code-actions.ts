"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { ValidationError, zonedDateIso } from "@foundry/commons";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getDiscountPolicy } from "@/lib/services/app-settings.service";
import { couponsService } from "@/lib/services/coupons.service";
import { repAllowanceFor, repAllowanceZone } from "@/lib/services/rep-allowance";

export type RepCodeAllowance = { capAmount: number; capPct: number; left: number; total: number; validityHours: number };

// The signed-in staff member's own allowance and today's count. Always the session's
// account: a code is issued on the account of whoever is signed in, never a client-sent id.
async function ownAllowance() {
  await requireStaff();
  const publicId = (await getSession())?.user?.id;
  const [staff] = publicId
    ? await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1)
    : [];
  const allowance = publicId ? repAllowanceFor(await getDiscountPolicy(), publicId) : null;
  if (!staff || !allowance) throw new ValidationError("Staff discounts are not enabled for your account");
  const istDate = zonedDateIso(Date.now(), await repAllowanceZone());
  return { staffId: staff.id, allowance, istDate };
}

const view = (a: { capAmount: number; capPct: number; dailyUses: number; codeValidityHours: number }, used: number): RepCodeAllowance => ({
  capAmount: a.capAmount,
  capPct: a.capPct,
  left: Math.max(0, a.dailyUses - used),
  total: a.dailyUses,
  validityHours: a.codeValidityHours,
});

export async function repCodeAllowance(): Promise<ActionResult<{ allowance: RepCodeAllowance }>> {
  return runAction(async () => {
    const { staffId, allowance, istDate } = await ownAllowance();
    return { allowance: view(allowance, await couponsService.repUsesToday(db, staffId, istDate)) };
  });
}

export async function issueRepCode(
  amount: number,
  note?: string,
): Promise<ActionResult<{ code: string; expiresAt: number; allowance: RepCodeAllowance }>> {
  return runAction(async () => {
    const { staffId, allowance, istDate } = await ownAllowance();
    if (!Number.isFinite(amount)) throw new ValidationError("Enter a discount amount");
    const expiresAt = Date.now() + allowance.codeValidityHours * 3_600_000;
    const { code, usedToday } = await couponsService.issueRepCode({
      ownerUserId: staffId,
      istDate,
      amount,
      capPct: allowance.capPct,
      capAmount: allowance.capAmount,
      dailyUses: allowance.dailyUses,
      expiresAt,
      note: note?.slice(0, 200),
    });
    revalidatePath("/dashboard/discounts", "layout");
    return { code, expiresAt, allowance: view(allowance, usedToday) };
  });
}
