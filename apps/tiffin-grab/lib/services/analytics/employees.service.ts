import { isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { coupons, inquiries, tickets, users } from "@/db/schema";

const intCount = sql<number>`cast(count(*) as int)`;

export type EmployeeRow = {
  userId: string;
  name: string;
  leadsWorked: number;
  leadsConverted: number;
  conversionRatePct: number;
  ticketsResolved: number;
  avgResolutionHours: number | null;
  repDailyCoupons: number;
};

// Per-rep rollup across leads/tickets/coupons — there's no dedicated staff
// table, reps are just `users` referenced via currentOwner/ownerUserId on
// the domain tables, so this merges several grouped queries by user id.
export async function getEmployeeRollup(): Promise<EmployeeRow[]> {
  const [leadRows, ticketRows, couponRows, staff] = await Promise.all([
    db
      .select({
        owner: inquiries.currentOwner,
        worked: intCount,
        converted: sql<number>`cast(count(*) filter (where ${inquiries.stage} = 'converted') as int)`,
      })
      .from(inquiries)
      .where(isNotNull(inquiries.currentOwner))
      .groupBy(inquiries.currentOwner),
    db
      .select({
        owner: tickets.currentOwner,
        resolved: sql<number>`cast(count(*) filter (where ${tickets.status} in ('resolved','closed')) as int)`,
        avgMs: sql<number | null>`avg(${tickets.closedAt} - ${tickets.createdAt}) filter (where ${tickets.closedAt} is not null)`,
      })
      .from(tickets)
      .where(isNotNull(tickets.currentOwner))
      .groupBy(tickets.currentOwner),
    db
      .select({ owner: coupons.ownerUserId, n: intCount })
      .from(coupons)
      .where(sql`${coupons.kind} = 'rep_daily' and ${coupons.ownerUserId} is not null`)
      .groupBy(coupons.ownerUserId),
    db.select({ id: users.id, name: users.name, email: users.email }).from(users),
  ]);

  const nameById = new Map(staff.map((u) => [u.id.toString(), u.name?.trim() || u.email]));

  const byOwner = new Map<string, EmployeeRow>();
  const ensure = (id: bigint): EmployeeRow => {
    const key = id.toString();
    let row = byOwner.get(key);
    if (!row) {
      row = {
        userId: key,
        name: nameById.get(key) ?? "Unknown",
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
