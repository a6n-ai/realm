import { and, eq, exists, not, or, sql } from "drizzle-orm";
import { wordpressImportSql } from "./wordpress-import-sql";
import { db } from "@/db/client";
import { orders, payments } from "@/db/schema";
import { PAID, PENDING } from "@/lib/payments/status";
import { paymentStatusIn, planPaymentSql } from "@/lib/payments/status-sql";

/**
 * Labels, kitchen packing, and OptimoRoute: only active orders whose money is
 * settled. Payment-review rows stay `orders.status = active` so deliveries can
 * materialize early — this filter keeps them off the truck until verified.
 * A plan migrated from WordPress (deploymentId `wc-…`, total 0) was prepaid there
 * and carries no payment row, so it is ready without one. Only that pair: a
 * zero total reached any other way still needs a settled payment.
 */
export function fulfillmentReadyOrder() {
  return and(
    eq(orders.status, "active"),
    or(
      and(eq(orders.total, "0"), wordpressImportSql),
      exists(
        db
          .select({ _: sql`1` })
          .from(payments)
          .where(and(eq(payments.orderId, orders.id), paymentStatusIn(PAID))),
      ),
    ),
    not(
      exists(
        db
          .select({ _: sql`1` })
          .from(payments)
          // A pending add-on link holds nothing: its add-ons are not on the plan until it is paid.
          .where(and(eq(payments.orderId, orders.id), paymentStatusIn(PENDING), planPaymentSql)),
      ),
    ),
  );
}
