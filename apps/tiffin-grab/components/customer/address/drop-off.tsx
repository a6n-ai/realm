"use client";
import { ChoiceRow } from "@/components/customer/deliveries/actions/choice-row";

/** An admin delivery strategy as the customer sees it: "Drop-off". */
export type DropOffOption = {
  publicId: string;
  name: string;
  chargeType: "none" | "fixed" | "percent";
  chargeValue: number;
};

const NONE = "";

/** "Back door · +$1.50", "Lobby · +5%", or just the name when it is free. */
export function dropOffLabel(o: DropOffOption): string {
  if (o.chargeType === "fixed" && o.chargeValue > 0) return `${o.name} · +$${o.chargeValue.toFixed(2)}`;
  if (o.chargeType === "percent" && o.chargeValue > 0) return `${o.name} · +${o.chargeValue}%`;
  return o.name;
}

/** Where at the address the tiffin is left. Same buttons as every other choice row. */
export function DropOffPicker({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: DropOffOption[];
  /** Strategy public id; null = no preference. */
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <ChoiceRow
      label="Drop-off"
      choices={[
        { value: NONE, label: "No preference", disabled },
        ...options.map((o) => ({ value: o.publicId, label: dropOffLabel(o), disabled })),
      ]}
      value={value ?? NONE}
      onChange={(v) => onChange(v === NONE ? null : v)}
    />
  );
}
