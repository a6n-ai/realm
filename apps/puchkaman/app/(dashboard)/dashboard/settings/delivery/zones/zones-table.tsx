"use client";

import { MapPinnedIcon, PencilIcon } from "lucide-react";
import { DataTable, type Column } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import { TableCell } from "@realm/ui/table";
import type { MapZone } from "./zone-map";
import type { TypeOption, ZoneRow } from "./types";

type ZoneCol = "zone" | "band" | "offers" | "status" | "actions";

const COLUMNS: readonly Column<ZoneCol>[] = [
  { key: "zone", label: "Zone", sortable: false },
  { key: "band", label: "Covers", sortable: false },
  { key: "offers", label: "Offers", sortable: false },
  { key: "status", label: "Status", sortable: false },
  { key: "actions", label: "", sortable: false, align: "right" },
];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

/**
 * Rows are ordered by radius and each shows the band it covers, not a bare
 * radius — a zone's inner edge is implied by the ring inside it, so "20 km"
 * alone never said where the zone starts.
 */
export function ZonesTable({
  zones,
  mapZones,
  types,
  focusedPublicId,
  onFocus,
  onEdit,
}: {
  zones: ZoneRow[];
  mapZones: MapZone[];
  types: TypeOption[];
  focusedPublicId: string | null;
  onFocus: (publicId: string | null) => void;
  onEdit: (zone: ZoneRow) => void;
}) {
  const labelByPublicId = new Map(types.map((t) => [t.publicId, t.label]));
  const colorByPublicId = new Map(mapZones.map((z) => [z.publicId, z.color]));
  const liveRadius = (z: ZoneRow) =>
    mapZones.find((m) => m.publicId === z.publicId)?.radiusKm ?? z.radiusKm;

  const ordered = [...zones].sort((a, b) => liveRadius(a) - liveRadius(b));
  const activeRadii = ordered.filter((z) => z.active).map(liveRadius);

  const innerEdgeFor = (z: ZoneRow) => {
    const smaller = activeRadii.filter((r) => r < liveRadius(z));
    return smaller.length ? Math.max(...smaller) : 0;
  };

  return (
    <DataTable
      columns={COLUMNS}
      rows={ordered}
      rowKey={(z) => z.publicId}
      serial={false}
      emptyIcon={MapPinnedIcon}
      emptyMessage="No delivery zones yet. Add one to start delivering."
      onRowClick={(z) => onFocus(focusedPublicId === z.publicId ? null : z.publicId)}
      rowClassName={(z) => (focusedPublicId === z.publicId ? "bg-accent/60" : "")}
      renderRow={(z) => (
        <>
          <TableCell className="font-medium">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ background: colorByPublicId.get(z.publicId) ?? "transparent" }}
              />
              {z.name || "Untitled zone"}
            </span>
          </TableCell>
          <TableCell className="tabular-nums">
            {z.active ? `${fmt(innerEdgeFor(z))}–${fmt(liveRadius(z))} km` : "—"}
          </TableCell>
          <TableCell>
            {z.typePublicIds.length === 0 ? (
              <span className="text-muted-foreground">Nothing</span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {z.typePublicIds.map((id) => (
                  <Badge key={id} variant="secondary" className="font-normal">
                    {labelByPublicId.get(id) ?? id}
                  </Badge>
                ))}
              </span>
            )}
          </TableCell>
          <TableCell>
            <Badge variant={z.active ? "default" : "outline"}>
              {z.active ? "Active" : "Retired"}
            </Badge>
          </TableCell>
          <TableCell className="text-right">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              aria-label={`Edit ${z.name || "zone"}`}
              onClick={(e) => {
                // The row itself focuses the ring; keep Edit from doing both.
                e.stopPropagation();
                onEdit(z);
              }}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          </TableCell>
        </>
      )}
    />
  );
}
