// Columns an admin may set on a user through the service write path.
// Deliberately excludes passwordHash (must go through hashPassword), email
// verification, and the framework-managed audit/identity columns, so a raw
// update cannot inject a bcrypt-bypassing hash or forge emailVerified.
export const USER_WRITABLE_FIELDS = ["name", "email", "phone", "role", "status"] as const;

export function pickUserWritable(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of USER_WRITABLE_FIELDS) {
    if (key in values) out[key] = values[key];
  }
  return out;
}
