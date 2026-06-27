import { tzOffsetMinutes, zonedDateIso } from "@tiffin/commons";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getDiscountPolicy } from "./app-settings.service";
import { couponsService } from "./coupons.service";

// Staff operate in IST; the daily rep allowance is anchored to the IST calendar
// day (UTC+5:30, no DST → a fixed UTC instant year-round).
const IST = "Asia/Kolkata";

// Epoch-ms of the END of the IST day `istDate` (exclusive) = 00:00 IST of the
// next day. With IST = UTC+5:30 this is 18:30 UTC of `istDate`. Derived via the
// zoned-time offset helper rather than hard-coding the offset.
function endOfIstDayMs(istDate: string): number {
  const [y, m, d] = istDate.split("-").map(Number);
  // 00:00 of the next IST day, read as a wall-clock instant.
  const wall = Date.UTC(y, m - 1, d + 1, 0, 0, 0);
  const offset = tzOffsetMinutes(IST, wall);
  return wall - offset * 60000;
}

export interface MintSummary {
  istDate: string;
  minted: number;
  skipped: number;
}

// The mint loop, shared by the protected cron route and the manual tsx trigger.
// Lists active sales reps (role=member, not the system user, honoring the
// per-rep `active` override) and mints one idempotent rep_daily coupon each with
// the effective ceilings (per-rep override ?? default) snapshotted at mint.
export async function mintRepCoupons(now: number = Date.now()): Promise<MintSummary> {
  const istDate = zonedDateIso(now, IST);
  const policy = await getDiscountPolicy();

  // Disabled allowance → no-op (the route returns this as a 200 summary).
  if (!policy.repDaily.enabled) return { istDate, minted: 0, skipped: 0 };

  const expiresAt = endOfIstDayMs(istDate);
  const reps = await db
    .select({ id: users.id, publicId: users.publicId })
    .from(users)
    .where(and(eq(users.role, "member"), eq(users.isSystem, false)));

  let minted = 0;
  let skipped = 0;
  for (const rep of reps) {
    const override = policy.repDaily.perRep[rep.publicId];
    // Absent override = active by default.
    if (override && override.active === false) {
      skipped += 1;
      continue;
    }
    const capPct = override?.capPct ?? policy.repDaily.defaultCapPct;
    const capAmount = override?.capAmount ?? policy.repDaily.defaultCapAmount;
    const inserted = await db.transaction((tx) =>
      couponsService.mintRepDaily(tx, {
        ownerUserId: rep.id,
        ownerPublicId: rep.publicId,
        istDate,
        capPct,
        capAmount,
        expiresAt,
      }),
    );
    if (inserted) minted += 1;
    else skipped += 1; // already minted today (idempotent re-run/redeploy)
  }

  return { istDate, minted, skipped };
}
