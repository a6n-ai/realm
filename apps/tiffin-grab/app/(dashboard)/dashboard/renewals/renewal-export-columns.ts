// Single source of truth for the renewals Excel export's column keys, labels, and row mapping.
import { zonedDateIso } from "@foundry/commons";
import { rowStatus, statusLabel, type RenewalsTab } from "@/lib/renewals/filters";
import type { RenewalRow, RenewedCustomerRow } from "@/lib/services/renewals.service";

export const PLAN_EXPORT_COLUMNS = [
  { key: "order", label: "Order" },
  { key: "customer", label: "Customer" },
  { key: "phone", label: "Phone" },
  { key: "mealSize", label: "Meal size" },
  { key: "plan", label: "Plan" },
  { key: "lastTiffin", label: "Last tiffin" },
  { key: "status", label: "Status" },
  { key: "priorPlans", label: "Prior renewals" },
  { key: "holds", label: "Hold days" },
  { key: "openTickets", label: "Open tickets" },
  { key: "walletCoins", label: "Wallet coins" },
  { key: "totalSpent", label: "Total spent" },
  { key: "lastSpent", label: "Last spent" },
  { key: "prevPlanTotal", label: "Previous plan total" },
] as const;

export const CUSTOMER_EXPORT_COLUMNS = [
  { key: "customer", label: "Customer" },
  { key: "phone", label: "Phone" },
  { key: "renewals", label: "Renewals" },
  { key: "plans", label: "Plans" },
  { key: "lastRenewed", label: "Last renewed" },
  { key: "currentMealSize", label: "Current meal size" },
  { key: "currentLastTiffin", label: "Current ends" },
  { key: "spent", label: "Spent" },
] as const;

export type PlanExportColumnKey = (typeof PLAN_EXPORT_COLUMNS)[number]["key"];
export type CustomerExportColumnKey = (typeof CUSTOMER_EXPORT_COLUMNS)[number]["key"];

const PLAN_KEYS = new Set<string>(PLAN_EXPORT_COLUMNS.map((c) => c.key));
const CUSTOMER_KEYS = new Set<string>(CUSTOMER_EXPORT_COLUMNS.map((c) => c.key));

/** Parse `?columns=a,b,c` into known keys for the active tab; empty/unknown falls back to every column. */
export function parseExportColumns(raw: string | null, tab: RenewalsTab): string[] {
  const defs = tab === "customers" ? CUSTOMER_EXPORT_COLUMNS : PLAN_EXPORT_COLUMNS;
  const allowed = tab === "customers" ? CUSTOMER_KEYS : PLAN_KEYS;
  const picked = (raw ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => allowed.has(k));
  return picked.length > 0 ? picked : defs.map((c) => c.key);
}

function money(v: string | null | undefined): number | "" {
  if (v == null || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
}

export function planRowToExcelRecord(
  row: RenewalRow,
  tab: RenewalsTab,
  today: string,
  columns: readonly string[],
): Record<string, string | number> {
  const status = rowStatus(row.status, row.lastTiffin, today);
  const all: Record<PlanExportColumnKey, string | number> = {
    order: row.code,
    customer: row.customerName,
    phone: row.phone ?? "",
    mealSize: row.mealSize,
    plan: row.planName,
    lastTiffin: row.lastTiffin,
    status: statusLabel(status, tab),
    priorPlans: Number(row.priorPlans) || 0,
    holds: Number(row.holds) || 0,
    openTickets: Number(row.openTickets) || 0,
    walletCoins: Number(row.walletCoins) || 0,
    totalSpent: money(row.totalSpent),
    lastSpent: money(row.planTotal),
    prevPlanTotal: money(row.prevOrderTotal),
  };
  const out: Record<string, string | number> = {};
  for (const key of columns) {
    const def = PLAN_EXPORT_COLUMNS.find((c) => c.key === key);
    if (def) out[def.label] = all[def.key];
  }
  return out;
}

export function customerRowToExcelRecord(
  row: RenewedCustomerRow,
  timezone: string,
  columns: readonly string[],
): Record<string, string | number> {
  const all: Record<CustomerExportColumnKey, string | number> = {
    customer: row.customerName || "",
    phone: row.phone ?? "",
    renewals: Number(row.renewals) || 0,
    plans: Number(row.plans) || 0,
    lastRenewed: zonedDateIso(row.lastRenewedAt, timezone),
    currentMealSize: row.currentMealSize ?? "",
    currentLastTiffin: row.currentLastTiffin ?? "",
    spent: money(row.totalSpent),
  };
  const out: Record<string, string | number> = {};
  for (const key of columns) {
    const def = CUSTOMER_EXPORT_COLUMNS.find((c) => c.key === key);
    if (def) out[def.label] = all[def.key];
  }
  return out;
}

export function exportHeaders(tab: RenewalsTab, columns: readonly string[]): string[] {
  const defs = tab === "customers" ? CUSTOMER_EXPORT_COLUMNS : PLAN_EXPORT_COLUMNS;
  return columns.flatMap((key) => {
    const def = defs.find((c) => c.key === key);
    return def ? [def.label] : [];
  });
}
