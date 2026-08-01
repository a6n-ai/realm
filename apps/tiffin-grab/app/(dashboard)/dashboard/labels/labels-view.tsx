"use client";

import { TagIcon, UtensilsCrossedIcon } from "lucide-react";
import { Badge } from "@realm/ui/badge";
import { TableCell } from "@realm/ui/table";
import { Card, DataTable, EmptyState, type Column } from "@/components/ds";
import type { DeliveryLabel, KitchenCount } from "@/lib/services/daily-labels.service";

const COUNT_COLUMNS: readonly Column<"category" | "dish" | "portion" | "count">[] = [
  { key: "category", label: "Category" },
  { key: "dish", label: "Dish" },
  { key: "portion", label: "Container" },
  { key: "count", label: "Count", align: "right" },
];

export function KitchenCounts({
  counts,
  byRoute,
}: {
  counts: KitchenCount[];
  byRoute: { group: string; labels: number; planned: boolean }[];
}) {
  if (counts.length === 0) {
    return <EmptyState icon={UtensilsCrossedIcon} message="Nothing scheduled for this day." />;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {byRoute.map((r) => (
          // "planned" = came from an OptimoRoute pull; otherwise it is a zone stand-in.
          <Badge key={r.group} variant={r.planned ? "secondary" : "outline"}>
            {r.group}: {r.labels}
          </Badge>
        ))}
      </div>
      <DataTable
        columns={COUNT_COLUMNS}
        rows={counts}
        rowKey={(c) => `${c.category}|${c.dish}|${c.portion ?? ""}`}
        serial={false}
        emptyIcon={UtensilsCrossedIcon}
        emptyMessage="Nothing scheduled for this day."
        renderRow={(c) => (
          <>
            <TableCell className="text-muted-foreground">{c.categoryLabel}</TableCell>
            <TableCell className="font-medium">{c.dish}</TableCell>
            <TableCell>{c.portion ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{c.count}</TableCell>
          </>
        )}
        mobileCard={(c) => (
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{c.dish}</p>
              <p className="text-muted-foreground text-xs">
                {c.categoryLabel}
                {c.portion ? ` · ${c.portion}` : ""}
              </p>
            </div>
            <span className="text-sm tabular-nums">{c.count}</span>
          </div>
        )}
      />
    </div>
  );
}

export function LabelList({ labels }: { labels: DeliveryLabel[] }) {
  if (labels.length === 0) {
    return <EmptyState icon={TagIcon} message="No labels for this day." />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {labels.map((label) => (
        <Card
          key={`${label.deliveryPublicId}-${label.personIndex}`}
          variant="flat"
          className="space-y-2 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{label.customerName}</p>
              <p className="text-muted-foreground truncate text-xs">
                {label.deploymentId} · {label.planName}
                {label.persons > 1 ? ` · person ${label.personIndex}/${label.persons}` : ""}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {label.routeDriver
                ? `${label.routeDriver}${label.routeStop != null ? ` · #${label.routeStop}` : ""}`
                : (label.zoneName ?? "Unzoned")}
            </Badge>
          </div>
          <ul className="space-y-0.5 text-xs">
            {label.lines.map((line, i) => (
              <li key={`${line.category}-${i}`} className="flex items-baseline gap-1">
                <span>{line.dish}</span>
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
  );
}
