import type { can } from "@/lib/auth/guards";

type Perms = Parameters<typeof can>[0];

const OVERVIEW_SECTIONS = {
  payment: { finance: ["read"] },
  contact: { customer: ["manage"] },
  inquiries: { inquiry: ["read"] },
} satisfies Record<string, Perms>;

export type OverviewSection = keyof typeof OVERVIEW_SECTIONS;

/** Overview sections the caller may open, in display order. `allowed` is the org permission check. */
export async function overviewSections(allowed: (perms: Perms) => boolean | Promise<boolean>): Promise<OverviewSection[]> {
  const keys = Object.keys(OVERVIEW_SECTIONS) as OverviewSection[];
  const ok = await Promise.all(keys.map((k) => allowed(OVERVIEW_SECTIONS[k])));
  return keys.filter((_, i) => ok[i]);
}
