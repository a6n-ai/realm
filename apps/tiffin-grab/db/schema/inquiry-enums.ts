import { pgEnum } from "drizzle-orm/pg-core";

// Leaf file: inquiries.ts and renewals.ts both use these, and importing one table
// file from the other is a load-order cycle (index.ts loads inquiries first).
export const inquiryLostReason = pgEnum("inquiry_lost_reason", [
  "price", "out_of_zone", "no_response", "chose_competitor", "not_ready", "other", "asked_to_stop",
]);
export const renewalStatus = pgEnum("renewal_status", [
  "renewed", "unresponsive", "not_renewed", "expected", "follow_up", "pending_payment",
]);
export const renewalStatusSource = pgEnum("renewal_status_source", ["staff", "auto"]);
