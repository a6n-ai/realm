// Central registry of entities whose UPDATE mutations are NOT written to the
// audit trail — high-churn / low-value rows where per-update history is noise.
// Keyed by table name (repo.tableName). The update still runs and stamps
// updatedBy; only the audit row is suppressed. Add a table name here to opt out.
export const AUDIT_UPDATE_SKIP: ReadonlySet<string> = new Set<string>([
  // e.g. "sessions",
]);
