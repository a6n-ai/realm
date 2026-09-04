import { updatableColumns } from "@foundry/database";
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";
import { organization } from "./organizations";

/**
 * Public-site FAQ, shown on /faq and the home page's FAQ section. Admin-
 * editable (Settings → Public Website → FAQ) instead of the old hardcoded
 * lib/faq.ts array.
 *
 * Client-scoping — same override pattern as deliveryZones/deliveryTypes,
 * but read as an override, not a union: a franchise with its own rows
 * (organizationId set) sees only those; a franchise with none falls back to
 * the brand's null-org rows. See listPublicFaqs in faqs.service.ts.
 */
export const publicFaqs = pgTable("public_faqs", {
  ...updatableColumns("faq"),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  organizationId: text("organization_id").references(() => organization.id),
});
