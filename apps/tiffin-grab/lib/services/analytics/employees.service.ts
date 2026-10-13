import { and, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { coupons, deliveryZones, inquiries, mealSizes, tickets, users } from "@/db/schema";
import { epochRangeWhere, type AnalyticsFilters } from "./shared-filters";

const intCount = sql<number>`cast(count(*) as int)`;

export type EmployeeRow = {
  userId: string;
  publicId: string | null;
  name: string;
  leadsWorked: number;
  leadsConverted: number;
  conversionRatePct: number;
  ticketsResolved: number;
  avgResolutionHours: number | null;
  repDailyCoupons: number;
};

function leadWhere(filters: AnalyticsFilters): SQL | undefined {
  const parts: (SQL | undefined)[] = [
    isNotNull(inquiries.currentOwner),
    epochRangeWhere(inquiries.createdAt, filters),
  ];
  if (filters.plans.length) parts.push(inArray(inquiries.planInterest, filters.plans));
  if (filters.mealSizes.length) {
    parts.push(
      sql`${inquiries.mealSizeInterest} in (
        select ${mealSizes.publicId} from ${mealSizes} where ${inArray(mealSizes.key, filters.mealSizes)}
      )`,
    );
  }
  if (filters.zones.length) {
    parts.push(
      sql`${inquiries.zoneId} in (select ${deliveryZones.id} from ${deliveryZones} where ${inArray(deliveryZones.name, filters.zones)})`,
    );
  }
  const defined = parts.filter((p): p is SQL => p != null);
  return defined.length ? and(...defined) : undefined;
}

// Per-rep rollup across leads/tickets/coupons — there's no dedicated staff
// table, reps are just `users` referenced via currentOwner/ownerUserId on
// the domain tables, so this merges several grouped queries by user id.
export async function getEmployeeRollup(
  filters: AnalyticsFilters = { plans: [], mealSizes: [], zones: [] },
): Promise<EmployeeRow[]> {
  const [leadRows, ticketRows, couponRows, staff] = await Promise.all([
    db
      .select({
        owner: inquiries.currentOwner,
        worked: intCount,
        converted: sql<number>`cast(count(*) filter (where ${inquiries.stage} = 'converted') as int)`,
      })
      .from(inquiries)
      .where(leadWhere(filters))
      .groupBy(inquiries.currentOwner),
    db
      .select({
        owner: tickets.currentOwner,
        resolved: sql<number>`cast(count(*) filter (where ${tickets.status} in ('resolved','closed')) as int)`,
        avgMs: sql<number | null>`avg(${tickets.closedAt} - ${tickets.createdAt}) filter (where ${tickets.closedAt} is not null)`,
      })
      .from(tickets)
      .where(and(isNotNull(tickets.currentOwner), epochRangeWhere(tickets.createdAt, filters)))
      .groupBy(tickets.currentOwner),
    db
      .select({ owner: coupons.ownerUserId, n: intCount })
      .from(coupons)
      .where(
        and(
          sql`${coupons.kind} = 'rep_daily' and ${coupons.ownerUserId} is not null`,
          epochRangeWhere(coupons.createdAt, filters),
        ),
      )
      .groupBy(coupons.ownerUserId),
    db.select({ id: users.id, publicId: users.publicId, name: users.name, email: users.email }).from(users),
  ]);

  const staffById = new Map(staff.map((u) => [u.id.toString(), u]));

  const byOwner = new Map<string, EmployeeRow>();
  const ensure = (id: bigint): EmployeeRow => {
    const key = id.toString();
    let row = byOwner.get(key);
    if (!row) {
      row = {
        userId: key,
        publicId: staffById.get(key)?.publicId ?? null,
        name: staffById.get(key)?.name?.trim() || staffById.get(key)?.email || "Unknown",
        leadsWorked: 0,
        leadsConverted: 0,
        conversionRatePct: 0,
        ticketsResolved: 0,
        avgResolutionHours: null,
        repDailyCoupons: 0,
      };
      byOwner.set(key, row);
    }
    return row;
  };

  for (const r of leadRows) {
    if (!r.owner) continue;
    const row = ensure(r.owner);
    row.leadsWorked = r.worked;
    row.leadsConverted = r.converted;
    row.conversionRatePct = r.worked > 0 ? Math.round((r.converted / r.worked) * 1000) / 10 : 0;
  }
  for (const r of ticketRows) {
    if (!r.owner) continue;
    const row = ensure(r.owner);
    row.ticketsResolved = r.resolved;
    row.avgResolutionHours = r.avgMs != null ? Math.round((r.avgMs / 3_600_000) * 10) / 10 : null;
  }
  for (const r of couponRows) {
    if (!r.owner) continue;
    const row = ensure(r.owner);
    row.repDailyCoupons = r.n;
  }

  return [...byOwner.values()].sort((a, b) => b.leadsWorked - a.leadsWorked);
}
