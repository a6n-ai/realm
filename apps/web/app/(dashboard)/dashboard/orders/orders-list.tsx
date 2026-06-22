"use client";

import { useState } from "react";
import { PackageIcon } from "lucide-react";
import { FilterBar, FilterPill, SearchInput, ListRow, OrderStatusBadge, EmptyState } from "@/components/ds";
import type { OrderListRow } from "@/lib/services/orders.service";

const STATUS_PILLS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "waitlisted", label: "Waitlisted" },
  { key: "paused", label: "Paused" },
  { key: "cancelled", label: "Cancelled" },
] as const;

const fmt = (n: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);

export function OrdersList({ rows }: { rows: OrderListRow[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  const countOf = (s: string) =>
    s === "all" ? rows.length : rows.filter((r) => r.status === s).length;

  const filtered = rows.filter((r) => {
    const matchStatus = status === "all" || r.status === status;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.fullName.toLowerCase().includes(q) ||
      r.deploymentId.toLowerCase().includes(q) ||
      r.city.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div className="space-y-4">
      <FilterBar
        search={
          <SearchInput value={search} onChange={setSearch} placeholder="Search orders…" />
        }
        filters={
          <>
            {STATUS_PILLS.map((p) => (
              <FilterPill
                key={p.key}
                label={p.label}
                active={status === p.key}
                count={countOf(p.key)}
                onClick={() => setStatus(p.key)}
              />
            ))}
          </>
        }
      />
      {filtered.length === 0 ? (
        <EmptyState icon={PackageIcon} message="No orders match your filter." />
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <ListRow
              key={o.publicId}
              title={o.fullName}
              meta={`${o.deploymentId} · ${o.city} · ${o.planKey} · ${fmt(Number(o.total))}`}
              trailing={<OrderStatusBadge status={o.status} />}
              href={`/dashboard/orders/${o.publicId}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
