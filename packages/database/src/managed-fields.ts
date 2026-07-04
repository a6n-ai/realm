// Framework-managed columns: identity + audit. They are stamped server-side
// (id by the DB default, createdBy/updatedBy from the session) and must never
// be set from client input — mirrors the reference AbstractDAO resetting
// CREATED_BY/CREATED_AT on write.
export const MANAGED_FIELDS = ["id", "publicId", "createdAt", "createdBy", "updatedAt", "updatedBy"] as const;
const CREATE_ONLY_FIELDS = ["createdAt", "createdBy"] as const;

function omit(values: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!keys.includes(k)) out[k] = v;
  }
  return out;
}

/** Strip every framework-managed field from arbitrary (client) input. */
export const stripManaged = (values: Record<string, unknown>): Record<string, unknown> =>
  omit(values, MANAGED_FIELDS);

/** Strip create-only audit fields from an update patch (never reassign on update). */
export const stripCreateOnly = (values: Record<string, unknown>): Record<string, unknown> =>
  omit(values, CREATE_ONLY_FIELDS);
