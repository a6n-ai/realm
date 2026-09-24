import { asc, desc, eq, gte, ilike, inArray, lte, or, sql, and, type AnyColumn, type SQL } from "drizzle-orm";
import { parseFilterState } from "@/components/ds";
import { db } from "@/db/client";
import { orders, payments, users } from "@/db/schema";
import { parseSort, type SortState } from "@/lib/list/sort";
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

/** The FacetFilters `dateRange` facet writes epoch-ms `from`/`to` params; either end may be open. */
export function dateRangeWhere(col: AnyColumn, sp: { from?: string; to?: string }): SQL | undefined {
  const n = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const a = n(sp.from);
  const b = n(sp.to);
  if (a != null && b != null) return and(gte(col, Math.min(a, b)), lte(col, Math.max(a, b)));
  if (a != null) return gte(col, a);
  if (b != null) return lte(col, b);
  return undefined;
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
  const { page } = parseFilterState([], sp);
  const sort = parseSort(sp, PAYMENT_SORT_KEYS, { column: "time", dir: "desc" });
  const q = sp.q?.trim();
  const statuses = csv(sp.status, PAYMENT_STATUS_OPTIONS);
  const methods = csv(sp.method, PAYMENT_METHOD_OPTIONS);

  const where = and(
    opts.where,
    statuses.length ? inArray(payments.status, statuses as never[]) : undefined,
    methods.length ? inArray(payments.method, methods as never[]) : undefined,
    dateRangeWhere(payments.createdAt, sp),
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
  const [{ total }] = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .leftJoin(users, eq(users.id, orders.userId))
    .where(where);
  const rows = await db
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
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .leftJoin(users, eq(users.id, orders.userId))
    .where(where)
    .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
    .limit(page.size)
    .offset(page.page * page.size);

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
