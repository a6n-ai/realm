import { tzOffsetMinutes, zonedDateIso } from "@foundry/commons";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getDiscountPolicy } from "./app-settings.service";
import { couponsService } from "./coupons.service";
import { repAllowanceFor, repAllowanceZone } from "./rep-allowance";

// Epoch-ms of the END of `date` (exclusive) in `tz` = 00:00 of the next day there.
// Derived via the zoned-time offset helper so DST is honoured.
function endOfZonedDayMs(date: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  // 00:00 of the next day, read as a wall-clock instant.
  const wall = Date.UTC(y, m - 1, d + 1, 0, 0, 0);
  const offset = tzOffsetMinutes(tz, wall);
  return wall - offset * 60000;
}

export interface MintSummary {
  istDate: string;
  minted: number;
  skipped: number;
}

// The mint loop, shared by the protected cron route and the manual tsx trigger.
// Lists active staff (admin or member, not the system user, honoring the
// per-rep `active` override) and mints one idempotent rep_daily coupon each with
// the effective ceilings (per-rep override ?? default) snapshotted at mint.
export async function mintRepCoupons(now: number = Date.now()): Promise<MintSummary> {
  const tz = await repAllowanceZone();
  const istDate = zonedDateIso(now, tz);
  const policy = await getDiscountPolicy();

  // Disabled allowance → no-op (the route returns this as a 200 summary).
  if (!policy.repDaily.enabled) return { istDate, minted: 0, skipped: 0 };

  const expiresAt = endOfZonedDayMs(istDate, tz);
  const reps = await db
    .select({ id: users.id, publicId: users.publicId })
    .from(users)
    .where(and(inArray(users.role, ["admin", "member"]), eq(users.isSystem, false)));

  let minted = 0;
  let skipped = 0;
  for (const rep of reps) {
    const allowance = repAllowanceFor(policy, rep.publicId);
    if (!allowance) {
      skipped += 1;
      continue;
    }
    const { capPct, capAmount, dailyUses } = allowance;
    const inserted = await db.transaction((tx) =>
      couponsService.mintRepDaily(tx, {
        ownerUserId: rep.id,
        ownerPublicId: rep.publicId,
        istDate,
        capPct,
        capAmount,
        dailyUses,
        expiresAt,
      }),
    );
    if (inserted) minted += 1;
    else skipped += 1; // already minted today (idempotent re-run/redeploy)
  }

  return { istDate, minted, skipped };
}
