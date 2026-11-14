/**
 * An address name another saved address already uses, as the error to show — the
 * address service refuses the same name twice (case-insensitive), this just says so
 * while typing instead of on save.
 */
export function nameTaken(name: string, others: { label: string }[]): string | undefined {
  const n = name.trim().toLowerCase();
  const hit = n ? others.find((a) => a.label.toLowerCase() === n) : undefined;
  return hit ? `You already have an address called "${hit.label}"` : undefined;
}
