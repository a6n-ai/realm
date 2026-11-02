import type { OwnerEntity, Strategy } from "./assignment";

export interface SummaryMember { publicId: string; name: string; weight: number }
export interface PoolSummary { lead: string; name: string | null; tail: string }

const PLURAL: Record<OwnerEntity, string> = { inquiry: "inquiries", order: "orders", ticket: "tickets" };

// The one-line outcome shown under a pool. Round robin mirrors pickAssignee: sort by publicId,
// take the member after the stored cursor (first when unknown).
export function poolSummary(
  entity: OwnerEntity,
  strategy: Strategy,
  members: SummaryMember[],
  cursorPublicId?: string,
): PoolSummary | null {
  if (strategy === "creator") {
    return { lead: `Staff who add ${entity === "inquiry" ? "an" : "a"} ${entity} own it. Others go to this pool.`, name: null, tail: "" };
  }
  if (members.length === 0) return null;
  const sorted = [...members].sort((a, b) => a.publicId.localeCompare(b.publicId));

  if (strategy === "round_robin") {
    const last = cursorPublicId ? sorted.findIndex((m) => m.publicId === cursorPublicId) : -1;
    const next = sorted[(last + 1) % sorted.length];
    return { lead: `Next ${entity} goes to `, name: next.name, tail: "" };
  }

  const total = sorted.reduce((s, m) => s + m.weight, 0);
  if (sorted.every((m) => m.weight === sorted[0].weight)) return { lead: "Split evenly", name: null, tail: "" };
  const top = sorted.reduce((a, b) => (b.weight > a.weight ? b : a));
  return { lead: "", name: top.name, tail: ` gets ${top.weight} of every ${total} ${PLURAL[entity]}` };
}

// Whole-number shares that always add to 100 is not needed; the bar only needs each member's own rounded share.
export function sharePct(weight: number, members: { weight: number }[]): number {
  const total = members.reduce((s, m) => s + m.weight, 0);
  return total > 0 ? Math.round((weight / total) * 100) : 0;
}
