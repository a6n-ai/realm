import { updatableColumns } from "@foundry/database";
import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { PaymentConfig } from "@foundry/payments";

export const app = pgTable("app", {
  ...updatableColumns("aps"),
  timezone: text("timezone").notNull().default("America/Toronto"),
  currency: text("currency").notNull().default("CAD"),
  paymentConfig: jsonb("payment_config").$type<PaymentConfig>(),
  integrationsConfig: jsonb("integrations_config").$type<Record<string, unknown>>(),
});
