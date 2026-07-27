// Central registry of entities whose UPDATE mutations are NOT written to the
// audit trail — high-churn / low-value rows where per-update history is noise.
// Keyed by table name (repo.tableName). The update still runs and stamps
// updatedBy; only the audit row is suppressed. Add a table name here to opt out.
//
// `app` holds integrations_config (OAuth tokens). Skip auto update audits;
// clover install/connect/disconnect write explicit recordAudit summaries instead.
export const AUDIT_UPDATE_SKIP: ReadonlySet<string> = new Set<string>(["app"]);
