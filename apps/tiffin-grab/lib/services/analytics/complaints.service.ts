import { inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { tickets } from "@/db/schema";

const intCount = sql<number>`cast(count(*) as int)`;
const OPEN_STATUSES = ["open", "in_progress", "waiting_on_customer"] as const;

export type ComplaintStats = {
  total: number;
  open: number;
  resolved: number;
  avgResolutionHours: number | null;
};

export async function getComplaintStats(): Promise<ComplaintStats> {
  const [[{ n: total }], [{ n: open }], [{ n: resolved }], avgRow] = await Promise.all([
    db.select({ n: intCount }).from(tickets),
    db.select({ n: intCount }).from(tickets).where(inArray(tickets.status, OPEN_STATUSES)),
    db.select({ n: intCount }).from(tickets).where(ne(tickets.status, "open")),
    db
      .select({
        avgMs: sql<number | null>`avg(${tickets.closedAt} - ${tickets.createdAt})`,
      })
      .from(tickets)
      .where(isNotNull(tickets.closedAt)),
  ]);
  const avgMs = avgRow[0]?.avgMs;
  return {
    total,
    open,
    resolved,
    avgResolutionHours: avgMs != null ? Math.round((avgMs / 3_600_000) * 10) / 10 : null,
  };
}

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Waiting on customer",
  resolved: "Resolved",
  closed: "Closed",
};

export async function getTicketStatusMix() {
  const rows = await db.select({ status: tickets.status, n: intCount }).from(tickets).groupBy(tickets.status);
  return rows.map((r) => ({ status: STATUS_LABELS[r.status] ?? r.status, n: r.n }));
}

const CATEGORY_LABELS: Record<string, string> = {
  order: "Order",
  billing: "Billing",
  catering: "Catering",
  general: "General",
};

export async function getTicketsByCategory() {
  const rows = await db.select({ category: tickets.category, n: intCount }).from(tickets).groupBy(tickets.category);
  return rows.map((r) => ({ category: CATEGORY_LABELS[r.category] ?? r.category, n: r.n }));
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export async function getTicketsByPriority() {
  const rows = await db.select({ priority: tickets.priority, n: intCount }).from(tickets).groupBy(tickets.priority);
  return rows.map((r) => ({ priority: PRIORITY_LABELS[r.priority] ?? r.priority, n: r.n }));
}
