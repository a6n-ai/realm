"use client";

import { useMemo, useState } from "react";
import { TagIcon, UtensilsCrossedIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import {
  Card,
  EmptyState,
  ListPagination,
  SearchInput,
  useSortNav,
} from "@/components/ds";
import { sortRows } from "@/lib/list/sort";
import type { DeliveryLabel, KitchenCount } from "@/lib/services/daily-labels.service";
import { useTableParams } from "./use-table-params";
import { groupKitchenCounts } from "./kitchen-groups";

export function KitchenCounts({
  counts,
  byRoute,
}: {
  counts: KitchenCount[];
  byRoute: { group: string; labels: number; planned: boolean }[];
}) {
  const groups = useMemo(() => groupKitchenCounts(counts), [counts]);

  if (counts.length === 0) {
    return <EmptyState icon={UtensilsCrossedIcon} message="Nothing scheduled for this day." />;
  }
  return (
    <div className="space-y-6">
      <LabelsPerGroup byRoute={byRoute} />
      {/* One card per station: the cook reads the category total, then each dish's portions. */}
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <Card key={g.category} variant="flat" className="overflow-hidden p-0">
            <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
              <h3 className="text-base font-semibold tracking-tight">{g.label}</h3>
              <p className="text-muted-foreground text-sm tabular-nums">
                <span className="text-foreground text-lg font-semibold">{g.containers.toLocaleString()}</span>{" "}
                {g.total && g.total.unit !== "oz" ? "packs" : "containers"}
                {g.total ? (
                  <>
                    {" · "}
                    <span className="text-foreground font-semibold">{g.total.amount.toLocaleString()}</span> {g.total.unit}
                    {/* Kitchens buy and batch in pounds; oz alone is hard to picture at this scale. */}
                    {g.total.unit === "oz" ? ` (${Math.round(g.total.amount / 16).toLocaleString()} lb)` : null}
                  </>
                ) : null}
              </p>
            </div>
            <ul className="divide-y">
              {g.dishes.map((d) => (
                <li key={d.dish} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium" title={d.dish}>{d.dish}</p>
                    {d.portions.length > 1 && g.dishes.length > 1 ? (
                      <p className="text-muted-foreground shrink-0 text-xs tabular-nums">{d.total} total</p>
                    ) : null}
                  </div>
                  <dl className="mt-2 flex flex-wrap gap-2">
                    {d.portions.map((p) => (
                      <div
                        key={p.portion ?? "-"}
                        className="bg-muted/60 flex min-w-16 flex-col rounded-md px-2.5 py-1.5"
                      >
                        <dt className="text-muted-foreground text-xs">{p.portion ?? "—"}</dt>
                        <dd className="text-xl font-semibold leading-tight tabular-nums">{p.count}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Before routes are pulled from OptimoRoute the groups are delivery zones; after,
// they are drivers (the real loading order). Say which, so the chips read as counts.
function LabelsPerGroup({ byRoute }: { byRoute: { group: string; labels: number; planned: boolean }[] }) {
  if (byRoute.length === 0) return null;
  const planned = byRoute.some((r) => r.planned);
  const groups = [...byRoute].sort((a, b) => b.labels - a.labels);
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{planned ? "Labels per driver" : "Labels per delivery zone"}</p>
        <p className="text-muted-foreground text-xs">
          {planned
            ? "From the OptimoRoute routes pulled for this day — pack in this order."
            : "Routes are not pulled from OptimoRoute yet, so labels are grouped by the customer's delivery zone."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {groups.map((r) => (
          <Badge key={r.group} variant={r.planned ? "secondary" : "outline"} className="gap-1.5">
            {r.group}
            <span className="font-semibold tabular-nums">{r.labels}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}

type LabelSortKey = "route" | "customer" | "orderId";

const LABEL_SORTS: { key: LabelSortKey; label: string }[] = [
  { key: "route", label: "Route" },
  { key: "customer", label: "Customer" },
  { key: "orderId", label: "Order ID" },
];

const routeKey = (l: DeliveryLabel) =>
  l.routeDriver
    ? `${l.routeDriver}|${String(l.routeStop ?? 0).padStart(5, "0")}`
    : `${l.zoneName ?? "~Unzoned"}|${l.customerName}`;

const LABEL_VALUE: Record<LabelSortKey, (l: DeliveryLabel) => string> = {
  route: routeKey,
  customer: (l) => l.customerName,
  orderId: (l) => l.deploymentId,
};

export function LabelList({ labels }: { labels: DeliveryLabel[] }) {
  const [query, setQuery] = useState("");
  const sortNav = useSortNav();
  const { sort, pagination } = useTableParams(
    LABEL_SORTS.map((s) => s.key),
    { column: "route", dir: "asc" },
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? labels.filter((l) =>
          [l.customerName, l.deploymentId, l.planName, l.routeDriver, l.zoneName]
            .some((v) => v?.toLowerCase().includes(needle)),
        )
      : labels;
    return sortRows(filtered, sort, (l, column) => LABEL_VALUE[column](l));
  }, [labels, query, sort]);

  if (labels.length === 0) {
    return <EmptyState icon={TagIcon} message="No labels for this day." />;
  }

  const pageCount = Math.max(1, Math.ceil(shown.length / pagination.size));
  const page = Math.min(pagination.page, pageCount - 1);
  const pageLabels = shown.slice(page * pagination.size, (page + 1) * pagination.size);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-48 flex-1">
          <SearchInput value={query} onChange={setQuery} placeholder="Search customer, order, route, zone..." />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sort labels">
          {LABEL_SORTS.map((s) => {
            const active = sort.column === s.key;
            return (
              <Button
                key={s.key}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => sortNav(s.key, active && sort.dir === "asc" ? "desc" : "asc")}
              >
                {s.label}
                {active ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
              </Button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={TagIcon} message="No labels match that search." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pageLabels.map((label, i) => (
            <Card
              // Index: occurrenceDates can emit the same forDate twice for extras.
              key={`${label.deliveryPublicId}-${label.personIndex}-${label.forDate}-${page}-${i}`}
              variant="flat"
              className="space-y-2 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{label.customerName}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {label.deploymentId} · {label.planName}
                    {label.persons > 1 ? ` · person ${label.personIndex}/${label.persons}` : ""}
                    {label.forLabel ? ` · ${label.forLabel}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {label.routeDriver
                    ? `${label.routeDriver}${label.routeStop != null ? ` · #${label.routeStop}` : ""}`
                    : (label.zoneName ?? "Unzoned")}
                </Badge>
              </div>
              <ul className="space-y-0.5 text-xs">
                {label.lines.map((line, j) => (
                  <li key={`${line.category}-${j}`} className="flex items-baseline gap-1">
                    <span>{line.dish}{line.addon ? " (add-on)" : ""}</span>
                    {line.portion ? <span className="text-muted-foreground">({line.portion})</span> : null}
                    {/* Defaulted = the customer never picked, so the menu default was packed. */}
                    {line.defaulted ? <span className="text-muted-foreground">·default</span> : null}
                  </li>
                ))}
              </ul>
              {label.deliveryNotes ? (
                <p className="text-muted-foreground text-xs">Note: {label.deliveryNotes}</p>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {shown.length > 0 ? <ListPagination page={page} size={pagination.size} total={shown.length} /> : null}
    </div>
  );
}
