"use client";

import Link from "next/link";
import { GiftIcon } from "lucide-react";
import { DataTable, ListPagination, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { Badge } from "@/components/reui/badge";
import { TableCell } from "@foundry/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { ReferralListRow } from "@/lib/services/referrals.service";
import { REFERRAL_STATUS } from "./referral-status";

type ReferralColumn = "referrer" | "friend" | "status" | "friendCoins" | "referrerCoins" | "order" | "note" | "time";

const COLUMNS: readonly Column<ReferralColumn>[] = [
  { key: "referrer", label: "Referrer" },
  { key: "friend", label: "Friend" },
  { key: "status", label: "Status" },
  { key: "friendCoins", label: "Friend coins", align: "right" },
  { key: "referrerCoins", label: "Referrer coins", align: "right" },
  { key: "order", label: "First order" },
  { key: "note", label: "Skipped because" },
  { key: "time", label: "Joined" },
];

const SKIP: Record<string, string> = {
  off: "Rewards off",
  cap: "Referrer at max referrals",
  wallet_cap: "Wallet max balance",
  no_rate: "No coin value set",
  referrer_inactive: "Referrer inactive",
};

function Person({ p }: { p: { publicId: string; name: string | null; email: string } }) {
  return (
    <Link href={`/dashboard/customers/${p.publicId}`} className="hover:underline">
      {p.name || p.email}
    </Link>
  );
}

export function ReferralsTable({ rows, spec, total, page, size }: { rows: ReferralListRow[]; spec: FacetDef[]; total: number; page: number; size: number }) {
  const tz = useTimezone();
  return (
    <>
      <DataTable
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        filters={<ListSearchFilters spec={spec} placeholder="Search referrer or friend by name, email or phone…" shortPlaceholder="Search…" />}
        emptyIcon={GiftIcon}
        emptyMessage="No referrals yet. Set rewards in Wallet → Settings; customers share their code from the Refer tab."
        emptySearchMessage="No referrals match your search or filters."
        renderRow={(r) => (
          <>
            <TableCell><Person p={r.referrer} /></TableCell>
            <TableCell><Person p={r.friend} /></TableCell>
            <TableCell><Badge variant={REFERRAL_STATUS[r.status].variant}>{REFERRAL_STATUS[r.status].label}</Badge></TableCell>
            <TableCell className="text-right tabular-nums">{r.friendCoins}</TableCell>
            <TableCell className="text-right tabular-nums">{r.referrerCoins}</TableCell>
            <TableCell>
              {r.orderPublicId ? (
                <Link href={`/dashboard/orders/${r.orderPublicId}`} className="text-muted-foreground hover:underline">{r.orderPublicId}</Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">{r.skipReason ? (SKIP[r.skipReason] ?? r.skipReason) : "—"}</TableCell>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{formatEpoch(r.createdAt, { mode: "date", timeZone: tz })}</TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </>
  );
}

export function ReferralsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
