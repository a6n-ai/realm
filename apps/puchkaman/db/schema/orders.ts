import { baseColumns, updatableColumns } from "@realm/database";
import { bigint, index, integer, jsonb, numeric, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { employees } from "./employees";
import { products } from "./products";

/** Pickup order lifecycle (simpler than tiffin subscription orders). */
export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "fulfilled",
  "cancelled",
  "failed",
]);

export const orderFulfillment = pgEnum("order_fulfillment", ["pickup"]);

/**
 * Mirrors tiffin-grab payment_status (subset) + @realm/payments lifecycle.
 * Online Clover charges settle immediately → `paid`.
 */
export const paymentStatus = pgEnum("payment_status", [
  "awaiting_payment",
  "pending_verification",
  "paid",
  "rejected",
  "refunded",
  "failed",
]);

/** `clover` = Ecommerce iframe charge; cash/simulated for admin/dev paths later. */
export const paymentMethod = pgEnum("payment_method", ["clover", "cash", "simulated"]);

export const ledgerDirection = pgEnum("ledger_direction", ["debit", "credit"]);
export const ledgerEntryType = pgEnum("ledger_entry_type", [
  "payment",
  "refund",
  "discount",
  "adjustment",
]);

export type OrderPricingSnapshot = {
  currency: "CAD" | "USD";
  lines: {
    productPublicId: string;
    cloverItemId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
  subtotal: number;
  tax: number;
  total: number;
};

export const orders = pgTable(
  "orders",
  {
    ...updatableColumns("ord"),
    /** Null for guest checkout. */
    userId: bigint("user_id", { mode: "bigint" }).references(() => users.id),
    status: orderStatus("status").notNull().default("pending"),
    fulfillment: orderFulfillment("fulfillment").notNull().default("pickup"),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone"),
    note: text("note"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
    tax: numeric("tax", { precision: 10, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    pricingSnapshot: jsonb("pricing_snapshot").$type<OrderPricingSnapshot>().notNull(),
    /** Platform / atomic order id — POS-visible once created. */
    cloverOrderId: text("clover_order_id").unique(),
    /**
     * Local employee assigned to own this order on Clover Register.
     * Synced to Platform `employee: { id }` when `cloverOrderId` is set.
     */
    assignedEmployeeId: bigint("assigned_employee_id", { mode: "bigint" }).references(
      () => employees.id,
    ),
    paidAt: bigint("paid_at", { mode: "number" }),
  },
  (t) => [
    index("orders_status_created_idx").on(t.status, t.createdAt),
    index("orders_email_created_idx").on(t.customerEmail, t.createdAt),
    index("orders_user_created_idx").on(t.userId, t.createdAt),
    index("orders_assigned_employee_idx").on(t.assignedEmployeeId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    ...baseColumns("oit"),
    orderId: bigint("order_id", { mode: "bigint" })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: bigint("product_id", { mode: "bigint" })
      .notNull()
      .references(() => products.id),
    cloverItemId: text("clover_item_id").notNull(),
    name: text("name").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: numeric("line_total", { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const payments = pgTable(
  "payments",
  {
    ...baseColumns("pay"),
    orderId: bigint("order_id", { mode: "bigint" })
      .notNull()
      .references(() => orders.id),
    status: paymentStatus("status").notNull().default("awaiting_payment"),
    method: paymentMethod("method").notNull().default("clover"),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    capturedAt: bigint("captured_at", { mode: "number" }),
    /** Ecommerce charge id from pay-for-order / charges response. */
    cloverChargeId: text("clover_charge_id"),
    reference: text("reference"),
    note: text("note"),
  },
  (t) => [index("payments_order_idx").on(t.orderId)],
);

/**
 * Append-only money ledger (tiffin-grab pattern).
 * `userId` is nullable for guest checkouts.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    ...baseColumns("led"),
    userId: bigint("user_id", { mode: "bigint" }).references(() => users.id),
    orderId: bigint("order_id", { mode: "bigint" }).references(() => orders.id),
    paymentId: bigint("payment_id", { mode: "bigint" }).references(() => payments.id),
    direction: ledgerDirection("direction").notNull(),
    type: ledgerEntryType("type").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    memo: text("memo"),
  },
  (t) => [
    index("ledger_user_created_idx").on(t.userId, t.createdAt),
    index("ledger_order_idx").on(t.orderId),
  ],
);
