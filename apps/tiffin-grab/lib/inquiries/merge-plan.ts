// Pure merge planning for scripts/inquiries-merge.ts: no DB import, so it unit-tests without Postgres.

export type MergeRow = {
  id: bigint;
  publicId: string;
  stage: string;
  phone: string | null;
  whatsappPhone: string | null;
  email: string | null;
  latestActivityAt: number;
  createdAt: number;
  [k: string]: unknown;
};

/** Same values as inquiry-core stageRank (that module touches the DB). Open rows outrank closed ones. */
const STAGE_RANK: Record<string, number> = { follow_up: 5, contacted: 4, quoted: 4, new: 3, converted: 2, lost: 1 };
const rank = (stage: string) => STAGE_RANK[stage] ?? 0;

const keysOf = (r: MergeRow) =>
  [
    // Phone and WhatsApp share one key space: a number is the same person on either column.
    r.phone ? `n:${r.phone.toLowerCase()}` : null,
    r.whatsappPhone ? `n:${r.whatsappPhone.toLowerCase()}` : null,
    r.email ? `e:${r.email.toLowerCase()}` : null,
  ].filter((k): k is string => k != null);

/** Rows that share any phone/WhatsApp number or email, transitively. Only groups of two or more. */
export function groupInquiries(rows: MergeRow[]): MergeRow[][] {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  rows.forEach((r, i) => {
    for (const k of keysOf(r)) {
      const j = owner.get(k);
      if (j == null) owner.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, MergeRow[]>();
  rows.forEach((r, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), r]);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Open before closed, then stage rank, then latest activity, then newest row. */
export function pickWinner(group: MergeRow[]): MergeRow {
  return [...group].sort(
    (a, b) => rank(b.stage) - rank(a.stage) || b.latestActivityAt - a.latestActivityAt || b.createdAt - a.createdAt,
  )[0]!;
}

const FILLABLE = [
  "fullName", "phone", "whatsappPhone", "email", "postalCode", "zoneId",
  "planInterest", "mealSizeInterest", "frequencyKeyInterest", "personsInterest", "eatingDaysInterest", "preferredStart",
] as const;
const IDENTIFIERS = new Set(["phone", "whatsappPhone", "email"]);
const isEmpty = (v: unknown) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

/**
 * Values the winner lacks, taken from the newest loser first. Never overwrites. An identifier held by a row
 * outside the group (`held`, lowercased) is skipped: writing it would break the unique indexes.
 */
export function fillPlan(winner: MergeRow, losers: MergeRow[], held: Set<string>): Record<string, unknown> {
  const plan: Record<string, unknown> = {};
  const newestFirst = [...losers].sort((a, b) => b.latestActivityAt - a.latestActivityAt || b.createdAt - a.createdAt);
  for (const f of FILLABLE) {
    if (!isEmpty(winner[f])) continue;
    for (const l of newestFirst) {
      const v = l[f];
      if (isEmpty(v)) continue;
      if (IDENTIFIERS.has(f) && typeof v === "string" && held.has(v.toLowerCase())) continue;
      plan[f] = v;
      break;
    }
  }
  return plan;
}
