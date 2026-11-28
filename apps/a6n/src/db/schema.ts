import { buildTables } from "@foundry/database/factory";
import { tables } from "./tables";

export const {
  users,
  organizations,
  members,
  invitations,
  teams,
  teamMembers,
  organizationRoles,
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
  collabDocs,
  collabShares,
  docMembers,
} = buildTables(tables, "sqlite");
