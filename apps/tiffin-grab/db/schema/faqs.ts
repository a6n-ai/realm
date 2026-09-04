import { updatableColumns } from "@foundry/database";
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";
import { organization } from "./organizations";

/**
 * Public-site FAQ, shown on /faq. Admin-editable (Settings → Public Website →
 * FAQ) instead of hardcoded page copy — same schema/service shape as
 * puchkaman's apps/puchkaman/db/schema/faqs.ts, the two callers a
 * @foundry package for this can eventually graduate from.
 *
 * Client-scoping — null = shared brand default, set = one org's own override.
 * Read as an override, not a union: an org with its own rows sees only
 * those; one with none falls back to the brand's null-org rows. See
 * listPublicFaqs in faqs.service.ts. This app has exactly one org today (see
 * resolveBrandOrgId in orders.service.ts), so the override path is inert
 * until franchise creation ships — same column, ready either way.
 */
export const publicFaqs = pgTable("public_faqs", {
  ...updatableColumns("faq"),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  organizationId: text("organization_id").references(() => organization.id),
});
