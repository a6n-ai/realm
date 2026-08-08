"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@realm/ui/card";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Switch } from "@realm/ui/switch";
import { ZoneMap, clampRadiusKm, type MapZone } from "./zone-map";
import { retireZoneAction, saveStoreOriginAction, saveZoneAction, setZoneTypesAction } from "./actions";

export type ZoneRow = {
  publicId: string;
  name: string;
  radiusKm: number;
  active: boolean;
  typePublicIds: string[];
};

export type TypeOption = { publicId: string; key: string; label: string; active: boolean };

const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

function ZoneCard({
  zone,
  allZones,
  types,
  radiusKm,
  onRadiusKmChange,
  onSaved,
}: {
  /** null for the "add zone" card. */
  zone: ZoneRow | null;
  /** Every existing active zone (for the client-side radius clamp), excluding this one. */
  allZones: MapZone[];
  types: TypeOption[];
  radiusKm: number;
  onRadiusKmChange: (v: number) => void;
  onSaved: () => void;
}) {
  const isNew = zone === null;
  const [name, setName] = useState(zone?.name ?? "");
  const [active, setActive] = useState(zone?.active ?? true);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(zone?.typePublicIds ?? []);
  const [pending, start] = useTransition();
  const [retiring, startRetire] = useTransition();

  const bounds = useMemo(() => {
    const others = allZones.filter((z) => z.active && z.publicId !== zone?.publicId);
    const smaller = others.map((z) => z.radiusKm).filter((r) => r < radiusKm);
    const larger = others.map((z) => z.radiusKm).filter((r) => r > radiusKm);
    return {
      min: smaller.length ? Math.max(...smaller) + 0.01 : 0.01,
      max: larger.length ? Math.min(...larger) - 0.01 : undefined,
    };
  }, [allZones, radiusKm, zone?.publicId]);

  function toggleType(publicId: string) {
    setSelectedTypes((prev) =>
      prev.includes(publicId) ? prev.filter((id) => id !== publicId) : [...prev, publicId],
    );
  }

  function save() {
    start(async () => {
      const res = await saveZoneAction({
        publicId: zone?.publicId ?? null,
        name,
        radiusKm,
        active,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.radiusKm != null) onRadiusKmChange(res.radiusKm);
      const publicId = zone?.publicId ?? res.publicId;
      if (publicId) {
        const typesRes = await setZoneTypesAction(publicId, selectedTypes);
        if (typesRes.error) {
          toast.error(typesRes.error);
          return;
        }
      }
      toast.success(isNew ? "Zone created" : "Zone saved");
      onSaved();
    });
  }

  function retire() {
    if (!zone) return;
    startRetire(async () => {
      const res = await retireZoneAction(zone.publicId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Zone retired");
      onSaved();
    });
  }

  const busy = pending || retiring;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{isNew ? "Add zone" : name || "Untitled zone"}</span>
          {!isNew && !active ? <Badge variant="secondary">Retired</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${zone?.publicId ?? "new"}`}>Name</Label>
            <Input
              id={`name-${zone?.publicId ?? "new"}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Inner"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`radius-${zone?.publicId ?? "new"}`}>Radius (km)</Label>
            <Input
              id={`radius-${zone?.publicId ?? "new"}`}
              type="number"
              min={bounds.min}
              max={bounds.max}
              step={0.5}
              value={radiusKm}
              onChange={(e) => {
                const raw = Number(e.target.value);
                onRadiusKmChange(
                  Number.isFinite(raw) ? clampRadiusKm(raw, allZones, zone?.publicId ?? "__new__") : raw,
                );
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Offered delivery types</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {types.map((t) => (
              <label
                key={t.publicId}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              >
                <span className="text-sm font-medium">{t.label}</span>
                <Switch
                  checked={selectedTypes.includes(t.publicId)}
                  onCheckedChange={() => toggleType(t.publicId)}
                />
              </label>
            ))}
            {types.length === 0 ? (
              <p className="text-muted-foreground text-sm">No delivery types yet.</p>
            ) : null}
          </div>
        </div>

        {!isNew ? (
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <span className="text-sm font-medium">Active</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          {!isNew ? (
            <Button type="button" variant="outline" size="sm" disabled={busy || !active} onClick={retire}>
              {active ? "Retire" : "Retired"}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" size="sm" disabled={busy} onClick={save}>
            {pending ? "Saving…" : isNew ? "Create" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ZoneEditor({
  apiKey,
  origin: initialOrigin,
  zones: initialZones,
  types,
}: {
  apiKey: string | null;
  origin: { lat: number; lng: number };
  zones: ZoneRow[];
  types: TypeOption[];
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState(initialOrigin);
  const [radii, setRadii] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialZones.map((z) => [z.publicId, z.radiusKm])),
  );
  const [addingNew, setAddingNew] = useState(false);
  const [newRadius, setNewRadius] = useState(5);
  const [originPending, startOrigin] = useTransition();
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
    setAddingNew(false);
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
      try {
        const res = await saveZoneAction({ publicId, name: zone.name, radiusKm, active: true });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        if (res.radiusKm != null) setRadii((r) => ({ ...r, [publicId]: res.radiusKm! }));
        router.refresh();
      } catch {
        toast.error("Couldn't save the radius change — try again");
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="lg:sticky lg:top-4 lg:self-start">
        {apiKey ? (
          <ZoneMap
            apiKey={apiKey}
            origin={origin}
            zones={mapZones}
            onRadiusChange={(publicId, radiusKm) => setRadii((r) => ({ ...r, [publicId]: radiusKm }))}
            onRadiusCommit={commitRadius}
            onOriginChange={commitOrigin}
          />
        ) : (
          <div className="text-muted-foreground flex min-h-[420px] items-center justify-center rounded-lg border p-6 text-center text-sm">
            Set NEXT_PUBLIC_GOOGLE_MAPS_KEY to show the map. Every value below is still editable
            without it.
          </div>
        )}
        <p className="text-muted-foreground mt-2 text-xs">
          Drag the shop pin to move the origin, or drag a ring&rsquo;s edge to resize it — every
          field is also editable from the cards on the right, keyboard only.
          {originPending ? " Saving shop location…" : ""}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddingNew(true)}
            disabled={addingNew}
          >
            <PlusIcon />
            Add zone
          </Button>
        </div>

        {addingNew ? (
          <ZoneCard
            zone={null}
            allZones={mapZones}
            types={types}
            radiusKm={newRadius}
            onRadiusKmChange={setNewRadius}
            onSaved={refresh}
          />
        ) : null}

        {initialZones.length === 0 && !addingNew ? (
          <p className="text-muted-foreground text-sm">No delivery zones yet.</p>
        ) : (
          initialZones.map((z) => (
            <ZoneCard
              key={z.publicId}
              zone={z}
              allZones={mapZones}
              types={types}
              radiusKm={radii[z.publicId] ?? z.radiusKm}
              onRadiusKmChange={(v) => setRadii((r) => ({ ...r, [z.publicId]: v }))}
              onSaved={refresh}
            />
          ))
        )}
      </div>
    </div>
  );
}
