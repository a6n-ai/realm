"use client";

import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  cheaperDropOff, dropOffFee, pickInConnection, pickTag, toggleStrategy,
  type DropOffCatalog, type DropOffOption, type DropOffValue,
} from "@/lib/catalog/drop-off";

function OptionLabel({ o }: { o: DropOffOption }) {
  const fee = dropOffFee(o);
  return (
    <>
      {o.name}
      {fee && o.waivedPct > 0 ? (
        <>
          <s className="text-muted-foreground text-xs tabular-nums">{fee}</s>
          <span className="text-success text-xs">{o.waivedPct >= 100 ? "Free" : `-${o.waivedPct}%`}</span>
        </>
      ) : fee ? (
        <span className="text-muted-foreground text-xs tabular-nums">{fee}</span>
      ) : null}
    </>
  );
}

/** Admin version of the customer DropOffPicker: same catalog and value rules, ToggleGroup look. */
export function DropOffToggles({ catalog, value, onChange, disabled }: {
  catalog: DropOffCatalog;
  value: DropOffValue;
  onChange: (v: DropOffValue) => void;
  disabled?: boolean;
}) {
  const tags = catalog.groups.filter((g) => catalog.options.some((o) => o.groupId === g.publicId));
  if (tags.length === 0) return null;
  const tag = tags.find((g) => g.publicId === value.tagId);
  const options = tag ? catalog.options.filter((o) => o.groupId === tag.publicId) : [];
  const sets = tag ? catalog.connections.filter((c) => c.groupId === tag.publicId && options.some((o) => o.connectionId === c.publicId)) : [];
  const loose = options.filter((o) => !o.connectionId || !sets.some((c) => c.publicId === o.connectionId));
  const cheaper = cheaperDropOff(catalog, value);

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label>Place</Label>
        <ToggleGroup type="single" variant="outline" size="default" spacing={2} className="flex-wrap" disabled={disabled}
          value={value.tagId ?? ""}
          // Empty value = the picked place was tapped again: every choice here is optional.
          onValueChange={(v) => onChange(pickTag(value, v || null))}>
          {tags.map((g) => <ToggleGroupItem key={g.publicId} value={g.publicId}>{g.name}</ToggleGroupItem>)}
        </ToggleGroup>
        {tag?.description && <p className="text-muted-foreground text-xs">{tag.description}</p>}
      </div>

      {sets.map((c) => {
        const picked = options.find((o) => o.connectionId === c.publicId && value.strategyIds.includes(o.publicId))?.publicId ?? "";
        return (
          <div key={c.publicId} className="grid gap-1.5">
            <Label>{c.name || "Choose one"}</Label>
            <ToggleGroup type="single" variant="outline" size="default" spacing={2} className="flex-wrap" disabled={disabled}
              value={picked}
              onValueChange={(v) => onChange(pickInConnection(catalog, value, c.publicId, v || null))}>
              {options.filter((o) => o.connectionId === c.publicId).map((o) => (
                <ToggleGroupItem key={o.publicId} value={o.publicId}><OptionLabel o={o} /></ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        );
      })}

      {loose.length > 0 && (
        <div className="grid gap-1.5">
          <Label>{sets.length > 0 ? "Also" : "Drop-off"}</Label>
          <ToggleGroup type="multiple" variant="outline" size="default" spacing={2} className="flex-wrap" disabled={disabled}
            value={value.strategyIds.filter((id) => loose.some((o) => o.publicId === id))}
            onValueChange={(next) => {
              const cur = value.strategyIds.filter((id) => loose.some((o) => o.publicId === id));
              const changed = [...next.filter((x) => !cur.includes(x)), ...cur.filter((x) => !next.includes(x))][0];
              if (changed) onChange(toggleStrategy(catalog, value, changed));
            }}>
            {loose.map((o) => <ToggleGroupItem key={o.publicId} value={o.publicId}><OptionLabel o={o} /></ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      )}

      {catalog.offers.map((offer) => (
        <p key={offer.name} className="text-success text-xs">
          {offer.name} · {offer.percent >= 100 ? "delivery fees waived" : `${offer.percent}% off delivery fees`}
        </p>
      ))}
      {cheaper && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {cheaper.alt.name} saves ${cheaper.saves.toFixed(2)}{cheaper.perDelivery ? " per delivery" : ""} on {cheaper.picked.name}
          </span>
          <Button type="button" variant="outline" size="xs" disabled={disabled}
            onClick={() => onChange(pickInConnection(catalog, value, cheaper.picked.connectionId!, cheaper.alt.publicId))}>
            Switch
          </Button>
        </div>
      )}
    </div>
  );
}
