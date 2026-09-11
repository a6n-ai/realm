-- Adds an explicit weekday set to delivery_frequencies for cadences that aren't
-- the two hardcoded shapes (5-day Mon-Fri, MWF) — e.g. legacy tiffingrab.ca
-- customers on "Tuesday - Thursday" only. See db/schema/catalog.ts comment and
-- lib/menu/delivery-days.ts orderDeliveryDays().
ALTER TABLE "delivery_frequencies" ADD COLUMN "weekdays" text[];
