/**
 * Decides whether a super-admin's platform bypass (passing a permission check through
 * platformRole, not their org role) writes an audit_log row. Every check calls this, so
 * one page render can ask many times; prod logged ~850 rows a day from 2 people.
 *
 * Policy: once per request per permission set. `seen` lives for one Worker request (see
 * onPlatformBypass in guards.tsx), so every page or action a super-admin opens is still
 * recorded, just not once per repeated check inside it.
 */
export function shouldAuditBypass(
  seen: Set<string>,
  userId: string,
  perms: Record<string, string[]>,
): boolean {
  const key = `${userId}|${Object.keys(perms)
    .toSorted()
    .map((resource) => `${resource}:${perms[resource]!.toSorted().join(",")}`)
    .join(";")}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}
