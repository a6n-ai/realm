"use client";
import { ChoiceRow } from "@/components/customer/deliveries/actions/choice-row";
import { dropOffLabel, pickDropOff, type DropOffCatalog } from "@/lib/catalog/drop-off";

const NONE = "";

/** Every drop-off question, one row each; the customer picks one option per question. */
export function DropOffPicker({
  catalog,
  value,
  onChange,
  disabled = false,
}: {
  catalog: DropOffCatalog;
  /** Picked option public ids, at most one per question. */
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  if (catalog.groups.length === 0) return null;
  return (
    <div className="grid gap-5">
      {catalog.groups.map((g) => {
        const options = catalog.options.filter((o) => o.groupId === g.publicId);
        const picked = options.find((o) => value.includes(o.publicId))?.publicId ?? NONE;
        return (
          <ChoiceRow
            key={g.publicId}
            label={g.name}
            labelTag={g.tag}
            hint={g.description ?? undefined}
            choices={[
              ...(g.required ? [] : [{ value: NONE, label: "No preference", disabled }]),
              ...options.map((o) => ({ value: o.publicId, label: dropOffLabel(o), tag: o.tag, disabled })),
            ]}
            value={picked}
            onChange={(v) => onChange(pickDropOff(catalog, value, g.publicId, v === NONE ? null : v))}
          />
        );
      })}
    </div>
  );
}
