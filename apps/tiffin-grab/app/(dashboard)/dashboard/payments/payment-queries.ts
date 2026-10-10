import { eq, ilike, inArray, or, sql, and, type AnyColumn, type SQL } from "drizzle-orm";
import { pageOrder } from "@foundry/database";
import { parseFilterState } from "@/components/ds";
import { db } from "@/db/client";
import { notificationOutbox, orders, payments, users } from "@/db/schema";
import type { SendState } from "@/lib/services/customers.service";
import { parseSort, type SortState } from "@/lib/list/sort";
import { epochBoundsWhere, withDefaultMonth } from "@/lib/list/default-month";
import { attachmentHref } from "@/lib/services/ticket-attachments";
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_SORT_KEYS,
  PAYMENT_STATUS_OPTIONS,
  type PaymentRow,
  type PaymentSortKey,
} from "./payment-facets";

const SORT_COL = {
  time: payments.createdAt,
  customer: users.email,
  order: orders.publicId,
  method: payments.method,
  status: payments.status,
  amount: payments.amount,
} as const;

type Sp = { q?: string; sort?: string; dir?: string; status?: string; method?: string; from?: string; to?: string };

/** The date picker writes epoch-ms `from`/`to` params; either end may be open. */
export function dateRangeWhere(col: AnyColumn, sp: { from?: string; to?: string }): SQL | undefined {
  return epochBoundsWhere(col, sp);
}

const csv = (v: string | undefined, allowed: readonly { value: string }[]) =>
  (v ?? "")
    .split(",")
    .filter((x) => allowed.some((a) => a.value === x));

/** Newest first by default, server-paginated like Orders. `where` pins a tab's own rule. */
export async function listPayments(
  sp: Sp,
  opts: { where?: SQL } = {},
): Promise<{ rows: PaymentRow[]; total: number; page: number; size: number; sort: SortState<PaymentSortKey> }> {
  const dated = await withDefaultMonth(sp);
  const { page } = parseFilterState([], dated);
  const sort = parseSort(dated, PAYMENT_SORT_KEYS, { column: "time", dir: "desc" });
  const q = dated.q?.trim();
  const statuses = csv(dated.status, PAYMENT_STATUS_OPTIONS);
  const methods = csv(dated.method, PAYMENT_METHOD_OPTIONS);

  const where = and(
    opts.where,
    statuses.length ? inArray(payments.status, statuses as never[]) : undefined,
    methods.length ? inArray(payments.method, methods as never[]) : undefined,
    dateRangeWhere(payments.createdAt, dated),
    q
      ? or(
          ilike(orders.publicId, `%${q}%`),
          ilike(users.email, `%${q}%`),
          ilike(payments.reference, `%${q}%`),
          sql`${payments.method}::text ilike ${`%${q}%`}`,
        )
      : undefined,
  );

  const col = SORT_COL[sort.column];
  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .leftJoin(users, eq(users.id, orders.userId))
      .where(where),
    db
      .select({
        publicId: payments.publicId,
        createdAt: payments.createdAt,
        status: payments.status,
        method: payments.method,
        amount: payments.amount,
        reference: payments.reference,
        proof: payments.proof,
        claimedAt: payments.claimedAt,
        capturedAt: payments.capturedAt,
        note: payments.note,
        name: users.name,
        email: users.email,
        phone: users.phone,
        orderPublicId: orders.publicId,
        // Latest payment-reminder email for this order (its vars carry the order code).
        lastReminder: sql<SendState | null>`(select json_build_object('status', o.status, 'at', o.created_at, 'deliveredAt', o.delivered_at, 'openedAt', o.opened_at)
          from ${notificationOutbox} o
          where o.event = 'payment_reminder' and o.channel = 'email' and o.recipient_email = ${users.email}
            and o.payload->'vars'->'payment'->>'orderCode' = ${orders.deploymentId}
          order by o.created_at desc limit 1)`,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .leftJoin(users, eq(users.id, orders.userId))
      .where(where)
      .orderBy(...pageOrder(sort.dir, col, payments.id))
      .limit(page.size)
      .offset(page.page * page.size),
  ]);

  return {
    rows: await Promise.all(
      rows.map(async ({ proof, ...r }) => ({
        ...r,
        proofThumb: proof?.thumbUrl ?? null,
        proofHref: proof ? await attachmentHref(proof) : null,
        proofName: proof?.name ?? null,
      })),
    ),
    total,
    page: page.page,
    size: page.size,
    sort,
  };
}
