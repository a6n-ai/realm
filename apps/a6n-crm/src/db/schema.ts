import { buildTables } from "@foundry/database/factory";
import { tables } from "./tables";

export const {
  users,
  sessions,
  accounts,
  verifications,
  rateLimits,
  invites,
  companies,
  leadSources,
  leadSubsources,
  inquiries,
  inquiryActivities,
  auditLog,
} = buildTables(tables, "sqlite");
