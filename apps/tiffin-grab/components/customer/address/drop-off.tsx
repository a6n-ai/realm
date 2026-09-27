"use client";
import { useState } from "react";
import { PillToggle } from "@/components/customer/kit";
import { ChoiceRow } from "@/components/customer/deliveries/actions/choice-row";
import { dropOffLabel, pickDropOff, type DropOffCatalog } from "@/lib/catalog/drop-off";

const NONE = "";

/**
 * Delivery strategies, tags first: a chip per tag (with its pick, once made), and the
 * open tag's strategies under it. The customer picks one strategy per tag.
 */
export function DropOffPicker({
  catalog,
  value,
  onChange,
  disabled = false,
}: {
  catalog: DropOffCatalog;
  /** Picked strategy public ids, at most one per tag. */
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const pickIn = (groupId: string) => catalog.options.find((o) => o.groupId === groupId && value.includes(o.publicId));
  // Open the first required tag still unanswered, else the first tag.
  const [openId, setOpenId] = useState(
    () => (catalog.groups.find((g) => g.required && !pickIn(g.publicId)) ?? catalog.groups[0])?.publicId,
  );
  const open = catalog.groups.find((g) => g.publicId === openId) ?? catalog.groups[0];
  if (!open) return null;
  const options = catalog.options.filter((o) => o.groupId === open.publicId);

  return (
    <div className="grid gap-3">
      <div role="tablist" aria-label="Delivery" className="flex flex-wrap gap-2">
        {catalog.groups.map((g) => {
          const picked = pickIn(g.publicId);
          return (
            <PillToggle
              key={g.publicId}
              role="tab"
              aria-selected={g.publicId === open.publicId}
              on={g.publicId === open.publicId}
              onClick={() => setOpenId(g.publicId)}
              className="h-10 flex-none px-4 text-[14px] sm:text-[14px]"
            >
              {g.name}
              {picked && <span className="font-normal opacity-80">&nbsp;· {picked.name}</span>}
              {g.required && !picked && <span aria-label="required">&nbsp;*</span>}
            </PillToggle>
          );
        })}
      </div>
      <ChoiceRow
        label={open.name}
        hint={open.description ?? undefined}
        choices={[
          ...(open.required ? [] : [{ value: NONE, label: "No preference", disabled }]),
          ...options.map((o) => ({ value: o.publicId, label: dropOffLabel(o), disabled })),
        ]}
        value={pickIn(open.publicId)?.publicId ?? NONE}
        onChange={(v) => onChange(pickDropOff(catalog, value, open.publicId, v === NONE ? null : v))}
      />
    </div>
  );
}
