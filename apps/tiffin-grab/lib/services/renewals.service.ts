import { and, asc, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { db } from "@/db/client";
import { deliveries, mealSizes, orders, plans, tickets, users } from "@/db/schema";
import { addDays } from "@/lib/deliveries-view/week";
import type { RenewalsFilter, RenewalsTab } from "@/lib/renewals/filters";
import { lastTiffinSql, renewalMoney, renewalStatusSql, visibleOrgWhere, type RenewalStatus } from "./orders.service";

export type RenewalRow = {
  orderPublicId: string;
  code: string;
  customerName: string;
  phone: string | null;
  planName: string;
  mealSize: string;
  lastTiffin: string;
  status: RenewalStatus;
  /** Facts, not predictions: earlier paid plans, held or paused days on this plan, unresolved tickets. */
  priorPlans: number;
  holds: number;
  openTickets: number;
  walletCoins: number;
  totalSpent: string;
  prevOrderTotal: string | null;
};

export type RenewalCounts = { endingToday: number; endingWithin7: number; lapsed: number; renewedNotPaid: number };

const tabWhere = (tab: RenewalsTab) => (tab === "trials" ? isNotNull(orders.trialLength) : isNull(orders.trialLength));
const running = sql`${orders.status} in ('active', 'paused')`;
// A plan whose last tiffin has passed may still read active until the complete-plans job closes it.
const runningOrDone = sql`${orders.status} in ('active', 'paused', 'completed')`;

/** Running plans whose last tiffin is today through `days` out. */
const endingWhere = (today: string, days: number) => and(running, sql`${lastTiffinSql} between ${today} and ${addDays(today, days)}`);

/** Plans whose last tiffin was in the last `days` days and that have no later plan: the ones that lapsed. */
const lapsedWhere = (tab: RenewalsTab, today: string, days: number) =>
  and(runningOrDone, sql`${lastTiffinSql} between ${addDays(today, -days)} and ${addDays(today, -1)}`, sql`${renewalStatusSql(tab === "trials")} = 'none'`);

export async function listRenewals(visible: "all" | string[], f: RenewalsFilter, today: string, page: PageRequest): Promise<Page<RenewalRow>> {
  if (visible !== "all" && visible.length === 0) return { items: [], page: page.page, size: page.size, total: 0 };
  const where = and(
    tabWhere(f.tab),
    visibleOrgWhere(visible),
    or(f.ending != null ? endingWhere(today, f.ending) : undefined, f.ended != null ? lapsedWhere(f.tab, today, f.ended) : undefined),
  );

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: orders.id,
        userId: orders.userId,
        orderPublicId: orders.publicId,
        code: orders.deploymentId,
        customerName: orders.fullName,
        phone: users.phone,
        planName: plans.name,
        mealSize: mealSizes.name,
        lastTiffin: sql<string>`${lastTiffinSql}`,
        status: renewalStatusSql(f.tab === "trials"),
        priorPlans: sql<number>`(select cast(count(*) as int) from ${orders} as prior where prior.user_id = ${orders.userId} and prior.id <> ${orders.id} and prior.trial_length is null and prior.status in ('active', 'paused', 'completed') and prior.start_date < ${orders.startDate})`,
        holds: sql<number>`(select cast(count(*) as int) from ${deliveries} as d where d.order_id = ${orders.id} and d.status in ('skipped', 'paused'))`,
        openTickets: sql<number>`(select cast(count(*) as int) from ${tickets} as t where t.raised_by = ${orders.userId} and t.status not in ('resolved', 'closed'))`,
      })
      .from(orders)
      .innerJoin(plans, eq(orders.planId, plans.id))
      .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
      .leftJoin(users, eq(orders.userId, users.id))
      .where(where)
      // Upcoming endings first, soonest on top; then lapsed plans, most recent first.
      .orderBy(asc(sql`${lastTiffinSql} < ${today}`), asc(sql`case when ${lastTiffinSql} >= ${today} then ${lastTiffinSql} end`), desc(lastTiffinSql), asc(orders.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(orders).where(where),
  ]);

  const money = await renewalMoney(rows.map((r) => ({ id: r.id, userId: r.userId })));
  const items = rows.map(({ id, userId, ...r }) => {
    const uid = userId?.toString();
    return {
      ...r,
      walletCoins: uid ? (money.walletByUser.get(uid) ?? 0) : 0,
      totalSpent: uid ? (money.spentByUser.get(uid) ?? "0.00") : "0.00",
      prevOrderTotal: money.prevTotalByOrder.get(id.toString()) ?? null,
    };
  });
  return { items, page: page.page, size: page.size, total: count };
}

/** The cards above the list: one pass over plans ending within 7 days or lapsed within `lapsedDays`. */
export async function countRenewals(visible: "all" | string[], tab: RenewalsTab, today: string, lapsedDays: number): Promise<RenewalCounts> {
  if (visible !== "all" && visible.length === 0) return { endingToday: 0, endingWithin7: 0, lapsed: 0, renewedNotPaid: 0 };
  const status = renewalStatusSql(tab === "trials");
  const [r] = await db
    .select({
      endingToday: sql<number>`cast(count(*) filter (where ${running} and ${lastTiffinSql} = ${today}) as int)`,
      endingWithin7: sql<number>`cast(count(*) filter (where ${endingWhere(today, 7)}) as int)`,
      lapsed: sql<number>`cast(count(*) filter (where ${lastTiffinSql} < ${today} and ${status} = 'none') as int)`,
      renewedNotPaid: sql<number>`cast(count(*) filter (where ${status} in ('unpaid', 'waitlisted')) as int)`,
    })
    .from(orders)
    .where(and(tabWhere(tab), visibleOrgWhere(visible), runningOrDone, sql`${lastTiffinSql} between ${addDays(today, -lapsedDays)} and ${addDays(today, 7)}`));
  return r;
}
