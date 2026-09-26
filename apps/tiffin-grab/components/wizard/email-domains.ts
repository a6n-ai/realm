export const COMMON_EMAIL_DOMAINS = ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com"] as const;

/**
 * Completions for what is typed after "@": nothing before the "@" is typed, or
 * once the domain already matches one exactly.
 */
export function emailDomainSuggestions(value: string): string[] {
  const at = value.indexOf("@");
  if (at < 1 || value.indexOf("@", at + 1) !== -1) return [];
  const local = value.slice(0, at);
  const partial = value.slice(at + 1).toLowerCase();
  return COMMON_EMAIL_DOMAINS.filter((d) => d.startsWith(partial) && d !== partial).map((d) => `${local}@${d}`);
}
