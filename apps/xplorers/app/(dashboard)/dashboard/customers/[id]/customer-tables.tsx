"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheckIcon, CreditCardIcon, ScrollTextIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { DataTable, SearchInput, type Column } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { TableCell } from "@foundry/ui/table";
import { PAYMENT_STATUS_LABEL, paymentBadgeVariant } from "@/lib/payments/labels";
import { PaymentReviewButtons } from "../../sessions/payment-review-buttons";

export type CustomerBookingRow = {
  publicId: string;
  classTitle: string;
  occurrencePublicId: string;
  dayLabel: string;
  seats: number;
  status: string;
  total: number | null;
};
export type CustomerPaymentRow = {
  publicId: string;
  whenLabel: string;
  status: string;
  method: string;
  reference: string | null;
  amount: string;
  currency: string;
  bookingPublicId: string;
};
export type CustomerLedgerRow = {
  publicId: string;
  whenLabel: string;
  direction: string;
  type: string;
  amount: string;
  currency: string;
  memo: string | null;
};

// Local search/status state, not DataTable's URL-bound search: three tables on
// one page would fight over the same `q` param (tiffin-grab's customer page does
// the same). Each list is one family's rows, so filtering in JS is fine.
function useFiltered<T extends object>(rows: T[], text: (r: T) => string[]) {
  const statusOf = (r: T) => ("status" in r ? String(r.status) : undefined);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const statuses = useMemo(() => [...new Set(rows.map(statusOf).filter(Boolean))] as string[], [rows]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && statusOf(r) !== status) return false;
      return !needle || text(r).some((v) => v.toLowerCase().includes(needle));
    });
  }, [rows, q, status, text]);
  return { q, setQ, status, setStatus, statuses, filtered };
}

function StatusSelect({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: string[]; label: (s: string) => string }) {
  if (options.length === 0) return null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-36">
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        {options.map((s) => (
          <SelectItem key={s} value={s}>
            {label(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const BOOKING_COLUMNS: readonly Column<"class" | "day" | "seats" | "status" | "total">[] = [
  { key: "class", label: "Class" },
  { key: "day", label: "Date" },
  { key: "seats", label: "Seats", align: "right" },
  { key: "status", label: "Status" },
  { key: "total", label: "Total", align: "right" },
];

const bookingText = (r: CustomerBookingRow) => [r.classTitle, r.dayLabel, r.publicId];

export function CustomerBookingsTable({ rows, currency }: { rows: CustomerBookingRow[]; currency: string }) {
  const f = useFiltered(rows, bookingText);
  return (
    <DataTable
      pagination="client"
      columns={BOOKING_COLUMNS}
      rows={f.filtered}
      rowKey={(r) => r.publicId}
      idAccessor={(r) => r.publicId}
      idHref={(r) => `/dashboard/sessions/${r.occurrencePublicId}`}
      idLabel="Booking"
      emptyIcon={CalendarCheckIcon}
      emptyMessage="No bookings yet."
      emptySearchMessage="No bookings match your search."
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={f.q} onChange={f.setQ} placeholder="Search bookings…" shortPlaceholder="Search…" />
          <StatusSelect value={f.status} onChange={f.setStatus} options={f.statuses} label={(s) => s} />
        </div>
      }
      renderRow={(r) => (
        <>
          <TableCell className="font-medium">
            <Link href={`/dashboard/sessions/${r.occurrencePublicId}`} className="hover:underline">
              {r.classTitle}
            </Link>
          </TableCell>
          <TableCell className="tabular-nums">{r.dayLabel}</TableCell>
          <TableCell className="text-right tabular-nums">{r.seats}</TableCell>
          <TableCell>
            <Badge variant={r.status === "cancelled" ? "outline" : "default"} className="capitalize">
              {r.status}
            </Badge>
          </TableCell>
          <TableCell className="text-right tabular-nums">{r.total == null ? "Free" : formatMoney(r.total, currency)}</TableCell>
        </>
      )}
    />
  );
}

const PAYMENT_COLUMNS: readonly Column<"when" | "status" | "method" | "reference" | "amount" | "actions">[] = [
  { key: "when", label: "Time" },
  { key: "status", label: "Status" },
  { key: "method", label: "Method" },
  { key: "reference", label: "Reference" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "actions", label: "", align: "right" },
];

const paymentText = (r: CustomerPaymentRow) => [r.method, r.reference ?? "", r.bookingPublicId, r.publicId];

export function CustomerPaymentsTable({ rows, canReview }: { rows: CustomerPaymentRow[]; canReview: boolean }) {
  const f = useFiltered(rows, paymentText);
  return (
    <DataTable
      pagination="client"
      columns={PAYMENT_COLUMNS}
      rows={f.filtered}
      rowKey={(r) => r.publicId}
      idAccessor={(r) => r.publicId}
      idLabel="Payment"
      emptyIcon={CreditCardIcon}
      emptyMessage="No payments yet."
      emptySearchMessage="No payments match your search."
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={f.q} onChange={f.setQ} placeholder="Search payments…" shortPlaceholder="Search…" />
          <StatusSelect value={f.status} onChange={f.setStatus} options={f.statuses} label={(s) => PAYMENT_STATUS_LABEL[s] ?? s} />
        </div>
      }
      renderRow={(r) => (
        <>
          <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">{r.whenLabel}</TableCell>
          <TableCell>
            <Badge variant={paymentBadgeVariant(r.status)}>{PAYMENT_STATUS_LABEL[r.status] ?? r.status}</Badge>
          </TableCell>
          <TableCell className="capitalize">{r.method}</TableCell>
          <TableCell className="font-mono text-xs">{r.reference ?? "—"}</TableCell>
          <TableCell className="text-right tabular-nums">{formatMoney(Number(r.amount), r.currency)}</TableCell>
          <TableCell className="text-right">
            {canReview ? <PaymentReviewButtons publicId={r.publicId} status={r.status} /> : null}
          </TableCell>
        </>
      )}
    />
  );
}

const LEDGER_COLUMNS: readonly Column<"when" | "type" | "direction" | "amount" | "memo">[] = [
  { key: "when", label: "Time" },
  { key: "type", label: "Type" },
  { key: "direction", label: "Direction" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "memo", label: "Memo" },
];

const ledgerText = (r: CustomerLedgerRow) => [r.type, r.memo ?? "", r.publicId];

export function CustomerLedgerTable({ rows }: { rows: CustomerLedgerRow[] }) {
  const f = useFiltered(rows, ledgerText);
  return (
    <DataTable
      pagination="client"
      columns={LEDGER_COLUMNS}
      rows={f.filtered}
      rowKey={(r) => r.publicId}
      idAccessor={(r) => r.publicId}
      idLabel="Entry"
      emptyIcon={ScrollTextIcon}
      emptyMessage="No ledger entries yet."
      emptySearchMessage="No entries match your search."
      filters={<SearchInput value={f.q} onChange={f.setQ} placeholder="Search ledger…" shortPlaceholder="Search…" />}
      renderRow={(r) => (
        <>
          <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">{r.whenLabel}</TableCell>
          <TableCell className="capitalize">{r.type}</TableCell>
          <TableCell className="capitalize">{r.direction}</TableCell>
          <TableCell className="text-right tabular-nums">
            {r.direction === "debit" ? "−" : "+"}
            {formatMoney(Number(r.amount), r.currency)}
          </TableCell>
          <TableCell className="text-muted-foreground">{r.memo ?? "—"}</TableCell>
        </>
      )}
    />
  );
}
