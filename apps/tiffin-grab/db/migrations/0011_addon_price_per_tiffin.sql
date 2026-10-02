-- Add-ons are priced per tiffin, not per week. No rows exist in either table yet.
ALTER TABLE "addons" RENAME COLUMN "price_per_week" TO "price_per_tiffin";--> statement-breakpoint
ALTER TABLE "order_addons" RENAME COLUMN "price_per_week" TO "price_per_tiffin";
