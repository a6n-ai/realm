"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BanIcon, TicketIcon } from "lucide-react";
import { DataTable, ListPagination, RowActionTooltipButton, SectionCard, type Column, type FacetDef, type StatItem } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { TableCell } from "@foundry/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { SortState } from "@/lib/list/sort";
import { setCouponActive } from "../actions";
import { DiscountStats, DiscountStatsSkeleton } from "../discount-stats";
import type { StaffCodeSortColumn } from "./page";

export type IssuedCode = {
  publicId: string;
  kind: "rep_code" | "rep_daily";
  code: string;
  amount: number | null;
  capPct: number | null;
  capAmount: number | null;
  note: string | null;
  createdAt: number;
  expiresAt: number | null;
  issuer: string;
  uses: number;
  maxUses: number;
  status: "unused" | "used" | "expired" | "revoked";
  customer: string | null;
  orderPublicId: string | null;
  applied: number | null;
};

const SECTION = {
  title: "Staff codes",
  subtitle: "Staff codes from Estimate or Create coupon, plus each rep's daily coupon: who owns it, how much of it is used, and by which customer and order.",
} as const;

const STATUS: Record<IssuedCode["status"], { label: string; variant: "success-light" | "info-light" | "warning-light" | "destructive-light" }> = {
  unused: { label: "Open", variant: "info-light" },
  used: { label: "Used up", variant: "success-light" },
  expired: { label: "Expired", variant: "warning-light" },
  revoked: { label: "Revoked", variant: "destructive-light" },
};

const COLUMNS: readonly Column<StaffCodeSortColumn | "type" | "issuer" | "uses" | "status" | "customer" | "order" | "actions">[] = [
  { key: "code", label: "Code", sortable: true },
  { key: "type", label: "Type" },
  { key: "issuer", label: "Issued by" },
  { key: "amount", label: "Amount", sortable: true, align: "right" },
  { key: "uses", label: "Uses", align: "right", width: "w-20" },
  { key: "created", label: "Created", sortable: true },
  { key: "expires", label: "Expires", sortable: true },
  { key: "status", label: "Status" },
  { key: "customer", label: "Used by" },
  { key: "order", label: "Order" },
  { key: "actions", label: "", align: "right", width: "w-16" },
];

// What the code is worth: a staff code is a fixed amount; a daily coupon is a ceiling.
function worth(c: IssuedCode): string {
  if (c.kind === "rep_code") return `$${(c.amount ?? 0).toFixed(2)}`;
  return `Up to ${c.capPct ?? 0}% · $${(c.capAmount ?? 0).toFixed(2)}`;
}

function RevokeButton({ publicId, code }: { publicId: string; code: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <RowActionTooltipButton
      icon={BanIcon}
      label={`Revoke ${code}`}
      hint="Revoke: the code stops working"
      tone="text-destructive"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await setCouponActive(publicId, false);
          toast.success(`${code} revoked`);
          router.refresh();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't revoke the code");
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function StaffCodes({
  stats, codes, spec, sort, total, page, size,
}: {
  stats: StatItem[];
  codes: IssuedCode[];
  spec: FacetDef[];
  sort: SortState<StaffCodeSortColumn>;
  total: number;
  page: number;
  size: number;
}) {
  const tz = useTimezone();
  const fmt = (ms: number) => formatEpoch(ms, { mode: "datetime", timeZone: tz });
  return (
    <div className="grid grid-cols-1 gap-6">
      <DiscountStats items={stats} />
      <SectionCard bleed title={SECTION.title} subtitle={SECTION.subtitle}>
        <div className="grid gap-4">
          <DataTable
            columns={COLUMNS}
            rows={codes}
            rowKey={(c) => c.publicId}
            sort={sort}
            serialOffset={page * size}
            filters={<ListSearchFilters spec={spec} placeholder="Search code, staff, customer or order…" shortPlaceholder="Search…" />}
            emptyIcon={TicketIcon}
            emptyMessage="No codes issued in these dates. Staff create them from Estimate or Create coupon."
            emptySearchMessage="No codes match your search or filters."
            renderRow={(c) => (
              <>
                <TableCell>
                  <span className="font-mono text-sm font-medium">{c.code}</span>
                  {c.note && <span className="text-muted-foreground block text-xs">{c.note}</span>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{c.kind === "rep_code" ? "Staff code" : "Daily coupon"}</Badge>
                </TableCell>
                <TableCell>{c.issuer}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.applied != null ? `$${c.applied.toFixed(2)}` : worth(c)}
                  {c.applied != null && (c.kind === "rep_daily" || c.applied < (c.amount ?? 0)) && (
                    <span className="text-muted-foreground block text-xs">of {worth(c)}</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.uses} / {c.maxUses}</TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums">{fmt(c.createdAt)}</TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums">{c.expiresAt == null ? "Never" : fmt(c.expiresAt)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS[c.status].variant}>{STATUS[c.status].label}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.customer ?? "—"}
                  {c.uses > 1 && <span className="block text-xs">+{c.uses - 1} more</span>}
                </TableCell>
                <TableCell>
                  {c.orderPublicId ? (
                    <Link href={`/dashboard/orders/${c.orderPublicId}`} className="text-muted-foreground hover:underline">
                      {c.orderPublicId}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {c.status === "unused" && <RevokeButton publicId={c.publicId} code={c.code} />}
                </TableCell>
              </>
            )}
          />
          <ListPagination page={page} size={size} total={total} />
        </div>
      </SectionCard>
    </div>
  );
}

export function StaffCodesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6">
      <DiscountStatsSkeleton />
      <SectionCard bleed title={SECTION.title} subtitle={SECTION.subtitle}>
        <DataTable.Skeleton columns={COLUMNS} />
      </SectionCard>
    </div>
  );
}
