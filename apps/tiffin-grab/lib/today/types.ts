// Shared by the server service and the "use client" queue. Kept out of any client file:
// a server module importing a constant from a "use client" file crashes in production.

export const TODAY_KINDS = ["payment", "missed", "ticket", "renewal", "lookout", "inquiry"] as const;
export type TodayKind = (typeof TODAY_KINDS)[number];

export const TODAY_KIND_LABEL: Record<TodayKind, string> = {
  payment: "Payments",
  missed: "Missed days",
  ticket: "Tickets",
  renewal: "Renewals",
  lookout: "Look out for",
  inquiry: "Inquiries",
};

export const isTodayKind = (v: string | undefined): v is TodayKind => TODAY_KINDS.some((k) => k === v);

export const TODAY_LIMIT = 50;

export type TodayBase = {
  key: string;
  who: string;
  what: string;
  /** Epoch ms. */
  since: number;
  urgency: 1 | 2 | 3;
  href: string;
};

export type TodayPayment = {
  orderId: string;
  paymentId: string;
  /** Plain decimal string, e.g. "120.00". */
  amount: string;
  method: string;
  reference: string | null;
  proofUrl: string | null;
  status: string;
};

export type TodayItem =
  | (TodayBase & { kind: "payment"; payment: TodayPayment; canVerify: boolean })
  | (TodayBase & { kind: "missed" | "ticket" | "renewal" | "lookout" | "inquiry" });

/** "3d ago", "in 2d", "5h ago": coarse on purpose, measured against a server-supplied `now` so hydration matches. */
export function waitingLabel(since: number, now: number): string {
  const diff = now - since;
  const abs = Math.abs(diff);
  const unit = abs < 36e5 ? `${Math.max(1, Math.round(abs / 6e4))}m` : abs < 864e5 ? `${Math.round(abs / 36e5)}h` : `${Math.round(abs / 864e5)}d`;
  return diff >= 0 ? `${unit} ago` : `in ${unit}`;
}

/** Type facet option: the exact total, "0 · clear" when nothing waits, "?" when that count failed. */
export function kindOptionLabel(kind: TodayKind, total: number | null): string {
  return `${TODAY_KIND_LABEL[kind]} · ${total == null ? "?" : total === 0 ? "0 · clear" : total}`;
}
