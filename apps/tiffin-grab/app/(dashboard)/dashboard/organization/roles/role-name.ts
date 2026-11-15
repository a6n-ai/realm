const ROLE_NAME = /^[a-z0-9-]+$/;
// The server's checkName is the authority; this mirrors it so the dialog can refuse before the round trip.
const BUILT_IN = new Set(["owner", "admin", "member"]);

export function validateRoleName(raw: string): string | undefined {
  const name = raw.trim();
  if (!name) return "Enter a role name.";
  if (name.length > 40) return "Use 40 characters or fewer.";
  if (!ROLE_NAME.test(name)) return "Use lowercase letters, digits and hyphens only.";
  if (BUILT_IN.has(name)) return `"${name}" is a built-in role. Choose another name.`;
}
