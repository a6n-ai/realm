"use client";

import { useState } from "react";
import { UsersIcon } from "lucide-react";
import { FilterBar, SearchInput, ListRow, OrderStatusBadge, EmptyState } from "@/components/ds";

type Row = {
  publicId: string;
  email: string | null;
  phone: string | null;
  orderCount: number;
  latestStatus: string | null;
};

export function CustomersList({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();
  const filtered = rows.filter(
    (r) =>
      !q ||
      (r.email ?? "").toLowerCase().includes(q) ||
      (r.phone ?? "").includes(q),
  );

  return (
    <div className="space-y-4">
      <FilterBar
        search={<SearchInput value={search} onChange={setSearch} placeholder="Search customers…" />}
        filters={null}
      />
      {filtered.length === 0 ? (
        <EmptyState icon={UsersIcon} message="No customers match your search." />
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <ListRow
              key={c.publicId}
              title={c.email ?? "(no email)"}
              meta={`${c.phone ?? "no phone"} · ${c.orderCount} order(s)`}
              trailing={c.latestStatus ? <OrderStatusBadge status={c.latestStatus} /> : undefined}
              href={`/dashboard/customers/${c.publicId}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
