import { updatableColumns } from "@foundry/database";
import { bigint, boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { organization } from "./organizations";

export const PROMO_PLACEMENTS = ["sticker", "popup", "section"] as const;

// Marketing promotion shown on the public landing page. `body` is the editor source (HTML or
// React); `html` is the sanitized render the public page uses.
export const promotions = pgTable("promotions", {
  ...updatableColumns("prm"),
  organizationId: text("organization_id").references(() => organization.id),
  title: text("title").notNull(),
  blurb: text("blurb"),
  body: text("body"),
  html: text("html"),
  imageUrl: text("image_url"),
  couponCode: text("coupon_code"),
  ctaLabel: text("cta_label").notNull().default("Claim offer"),
  ctaHref: text("cta_href"),
  placements: text("placements").array().notNull().default([]),
  startsAt: bigint("starts_at", { mode: "number" }),
  endsAt: bigint("ends_at", { mode: "number" }),
  active: boolean("active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
}, (t) => [
  index("promotions_active_idx").on(t.active, t.priority),
]);
