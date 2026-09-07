-- Catering now serves two regions (Toronto & the GTA, Metro Vancouver & the
-- Lower Mainland) but both notify one shared inbox, so the region is what
-- makes an enquiry triageable. Nullable: rows predating this were all GTA-era
-- submissions, and back-filling them with a guess would invent data.
ALTER TABLE "catering_inquiries" ADD COLUMN "region" text;
