"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@foundry/ui/dialog";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { ZoneMap, clampRadiusKm, type MapZone } from "./zone-map";
import { retireZoneAction, saveZoneAction, setZoneTypesAction } from "./actions";
import type { TypeOption, ZoneRow } from "./types";

/**
 * Radius bounds from the neighbouring rings. Mirrors the server-side clamp in
 * actions.ts — this copy only drives the input's min/max and the hint, the
 * server remains authoritative.
 */
function boundsFor(allZones: MapZone[], radiusKm: number, publicId: string | undefined) {
  const others = allZones.filter((z) => z.active && z.publicId !== publicId);
  const smaller = others.map((z) => z.radiusKm).filter((r) => r < radiusKm);
  const larger = others.map((z) => z.radiusKm).filter((r) => r > radiusKm);
  return {
    innerEdgeKm: smaller.length ? Math.max(...smaller) : 0,
    min: smaller.length ? Math.max(...smaller) + 0.01 : 0.01,
    max: larger.length ? Math.min(...larger) - 0.01 : undefined,
  };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function ZoneEditDialog({
  zone,
  allZones,
  types,
  origin,
  mapStyleUrl,
  onOpenChange,
  onSaved,
}: {
  /** null closes the dialog; a zone with no publicId opens it in create mode. */
  zone: ZoneRow | null;
  allZones: MapZone[];
  types: TypeOption[];
  /** Shared shop origin — shown, never moved from here. */
  origin: { lat: number; lng: number };
  mapStyleUrl: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isNew = zone !== null && zone.publicId === "";
  const [name, setName] = useState(zone?.name ?? "");
  const [radiusKm, setRadiusKm] = useState(zone?.radiusKm ?? 5);
  // The text the field shows is separate from the committed number: a partially
  // typed value ("", "1", "1.") is not a radius yet, and treating it as one is
  // what broke this field.
  const [radiusText, setRadiusText] = useState(String(zone?.radiusKm ?? 5));
  const [active, setActive] = useState(zone?.active ?? true);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(zone?.typePublicIds ?? []);
  const [pending, start] = useTransition();
  const [retiring, startRetire] = useTransition();

  // Bounds come from the COMMITTED radius, so the hint stays stable while typing
  // rather than describing whatever half-entered number is on screen.
  const bounds = boundsFor(allZones, radiusKm, zone?.publicId || undefined);

  /** Parse, clamp and adopt on blur; restore the last good value if unparseable. */
  function commitRadius() {
    const parsed = Number(radiusText.trim());
    if (!radiusText.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      setRadiusText(String(radiusKm));
      return;
    }
    const clamped = clampRadiusKm(parsed, allZones, zone?.publicId || "__new__");
    setRadiusKm(clamped);
    setRadiusText(String(clamped));
  }
  const busy = pending || retiring;

  // Every ring for context, with THIS one carrying the value being edited — so
  // dragging the handle and typing in the field drive the same circle.
  const editingId = zone?.publicId || "__new__";
  const mapZones: MapZone[] = [
    ...allZones.filter((z) => z.publicId !== editingId),
    {
      publicId: editingId,
      name: name || "This zone",
      radiusKm,
      active: true,
      color: allZones.find((z) => z.publicId === editingId)?.color ?? "#2563eb",
    },
  ];

  /** Drag updates both the committed number and the text the field shows. */
  function adoptRadius(_publicId: string, next: number) {
    setRadiusKm(next);
    setRadiusText(String(Math.round(next * 100) / 100));
  }

  function toggleType(publicId: string) {
    setSelectedTypes((prev) =>
      prev.includes(publicId) ? prev.filter((id) => id !== publicId) : [...prev, publicId],
    );
  }

  function save() {
    // Blur may not have fired if Save was clicked straight from the field.
    const typed = Number(radiusText.trim());
    const radiusToSave =
      radiusText.trim() && Number.isFinite(typed) && typed > 0
        ? clampRadiusKm(typed, allZones, zone?.publicId || "__new__")
        : radiusKm;
    start(async () => {
      const res = await saveZoneAction({
        publicId: isNew ? null : (zone?.publicId ?? null),
        name,
        radiusKm: radiusToSave,
        active,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const publicId = isNew ? res.publicId : zone?.publicId;
      if (publicId) {
        const typesRes = await setZoneTypesAction(publicId, selectedTypes);
        if (typesRes.error) {
          toast.error(typesRes.error);
          return;
        }
      }
      toast.success(isNew ? "Zone created" : "Zone saved");
      onSaved();
      onOpenChange(false);
    });
  }

  function retire() {
    if (!zone || isNew) return;
    startRetire(async () => {
      const res = await retireZoneAction(zone.publicId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Zone retired");
      onSaved();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={zone !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add zone" : `Edit ${zone?.name || "zone"}`}</DialogTitle>
          <DialogDescription>
            A ring measured out from the shop, and which options it offers.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Drag the ring's edge or type a number — both write the same value.
              The shop pin is fixed here: the origin is shared by every ring, so
              moving it from inside one zone's dialog would silently reshape the
              others. */}
          <ZoneMap
            origin={origin}
            zones={mapZones}
            focusedPublicId={editingId}
            onRadiusChange={adoptRadius}
            onRadiusCommit={adoptRadius}
            onOriginChange={() => {}}
            originDraggable={false}
            styleUrl={mapStyleUrl}
            heightPx={220}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="zone-name">Name</Label>
              <Input
                id="zone-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Inner"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zone-radius">Outer radius (km)</Label>
              <Input
                id="zone-radius"
                type="number"
                inputMode="decimal"
                min={bounds.min}
                max={bounds.max}
                step={0.5}
                className="tabular-nums"
                aria-describedby="zone-radius-help"
                value={radiusText}
                onChange={(e) => setRadiusText(e.target.value)}
                onBlur={commitRadius}
              />
              {/* Clamped on blur, never per keystroke. Clamping as you type made
                  the field unusable: clearing it to retype gives Number("") === 0,
                  which clamps to the 0.01 floor, and the bounds then recompute
                  against 0.01 — so the outermost ring rendered as though it were
                  the innermost, ceiling and all, and no new number could be typed. */}
              <p id="zone-radius-help" className="text-muted-foreground text-xs">
                {bounds.max === undefined
                  ? bounds.innerEdgeKm > 0
                    ? `Outermost ring — anything past ${fmt(bounds.innerEdgeKm)} km.`
                    : "The only ring — any distance from the shop."
                  : bounds.innerEdgeKm > 0
                    ? `Kept between ${fmt(bounds.innerEdgeKm)} and ${fmt(bounds.max)} km so it can't cross its neighbours.`
                    : `Kept under ${fmt(bounds.max)} km so it can't cross the next ring.`}
              </p>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Offered delivery types</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {types
                .filter((t) => t.active)
                .map((t) => (
                  <label
                    key={t.publicId}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <span className="text-sm">{t.label}</span>
                    <Switch
                      checked={selectedTypes.includes(t.publicId)}
                      onCheckedChange={() => toggleType(t.publicId)}
                    />
                  </label>
                ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
            <span className="text-sm font-medium">Active</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {!isNew ? (
            <Button type="button" variant="outline" disabled={busy || !active} onClick={retire}>
              {active ? "Retire" : "Retired"}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" disabled={busy} onClick={save}>
            {pending ? "Saving…" : isNew ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
