"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { ZoneMap, clampRadiusKm, type MapZone } from "./zone-map";
import { ZonesTable } from "./zones-table";
import { ZoneEditDialog } from "./zone-edit-dialog";
import { StoreOriginField } from "./store-origin-field";
import { saveStoreOriginAction, saveZoneAction } from "./actions";
import type { TypeOption, ZoneRow } from "./types";

export type { TypeOption, ZoneRow };

const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

/** Blank row that puts the dialog into create mode. */
const NEW_ZONE: ZoneRow = { publicId: "", name: "", radiusKm: 5, active: true, typePublicIds: [] };

export function ZoneEditor({
  mapStyleUrl,
  origin: initialOrigin,
  zones: initialZones,
  types,
}: {
  /** Vector style URL for the basemap; null falls back to keyless OSM raster. */
  mapStyleUrl: string | null;
  origin: { lat: number; lng: number };
  zones: ZoneRow[];
  types: TypeOption[];
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState(initialOrigin);
  const [radii, setRadii] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialZones.map((z) => [z.publicId, z.radiusKm])),
  );
  const [editing, setEditing] = useState<ZoneRow | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [, startOrigin] = useTransition();
  const [, startRadiusCommit] = useTransition();

  // Colours assigned by sorted radius so the smallest ring keeps its hue across renders.
  const colorByPublicId = useMemo(() => {
    const sorted = [...initialZones].filter((z) => z.active).sort((a, b) => a.radiusKm - b.radiusKm);
    return new Map(sorted.map((z, i) => [z.publicId, PALETTE[i % PALETTE.length]]));
  }, [initialZones]);

  const mapZones: MapZone[] = initialZones.map((z) => ({
    publicId: z.publicId,
    name: z.name,
    radiusKm: radii[z.publicId] ?? z.radiusKm,
    active: z.active,
    color: colorByPublicId.get(z.publicId) ?? "#2563eb",
  }));

  function refresh() {
    router.refresh();
  }

  function commitOrigin(lat: number, lng: number) {
    setOrigin({ lat, lng });
    startOrigin(async () => {
      const res = await saveStoreOriginAction(lat, lng);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Shop location updated");
      router.refresh();
    });
  }

  function commitRadius(publicId: string, radiusKm: number) {
    const zone = initialZones.find((z) => z.publicId === publicId);
    if (!zone) return;
    startRadiusCommit(async () => {
      const res = await saveZoneAction({
        publicId,
        name: zone.name,
        radiusKm,
        active: zone.active,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      // The server re-clamps; adopt its number so a drag that overshot a
      // neighbour snaps back to what was actually stored.
      if (res.radiusKm != null) {
        setRadii((r) => ({ ...r, [publicId]: res.radiusKm as number }));
      }
      toast.success(`${zone.name} updated`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <StoreOriginField
        origin={origin}
        onOriginResolved={(lat, lng) => {
          // The action already persisted it; just move the pin and rings.
          setOrigin({ lat, lng });
          router.refresh();
        }}
      />
      <ZoneMap
        origin={origin}
        zones={mapZones}
        focusedPublicId={focused}
        onRadiusChange={(publicId, radiusKm) => setRadii((r) => ({ ...r, [publicId]: radiusKm }))}
        onRadiusCommit={commitRadius}
        onOriginChange={commitOrigin}
        styleUrl={mapStyleUrl}
      />
      <p className="text-muted-foreground text-xs">
        Drag the shop pin to move the origin, or drag a ring&rsquo;s edge to resize it. Select a row
        to zoom to that zone — every field is also editable from the table, keyboard only.
      </p>

      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(NEW_ZONE)}>
          <PlusIcon />
          Add zone
        </Button>
      </div>

      <ZonesTable
        zones={initialZones}
        mapZones={mapZones}
        types={types}
        focusedPublicId={focused}
        onFocus={setFocused}
        onEdit={setEditing}
      />

      {/* key remounts the form per row so its fields reseed from the new zone. */}
      <ZoneEditDialog
        key={editing?.publicId || (editing ? "new" : "none")}
        zone={editing}
        allZones={mapZones}
        types={types}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={refresh}
      />
    </div>
  );
}

export { clampRadiusKm };
