"use client";
import { useState } from "react";
import { Field } from "@/components/customer/kit";
import { ChoiceRow, type RowChoice } from "@/components/customer/deliveries/actions/choice-row";

const PRESETS = ["Home", "Office", "Other"];
const NEW = "__new__";

/**
 * An address's tag: Home / Office / Other or one of the customer's own, each on at most
 * one address (the address service enforces it too). A tag another address already
 * has is greyed, its ⓘ naming that address; "New tag" takes a name of their own.
 */
export function AddressTagPicker({
  value,
  onChange,
  takenBy,
}: {
  value: string;
  onChange: (tag: string) => void;
  /** Tags other addresses already use → a short description of that address. */
  takenBy: Map<string, string>;
}) {
  const known = [...new Set([...PRESETS, ...takenBy.keys()])];
  const isKnown = (t: string) => known.some((k) => k.toLowerCase() === t.trim().toLowerCase());
  const [typing, setTyping] = useState(() => value.trim() !== "" && !isKnown(value));
  const clash = [...takenBy.keys()].find((k) => k.toLowerCase() === value.trim().toLowerCase());

  const choices: RowChoice[] = [
    ...known.map((tag) => {
      const where = takenBy.get(tag);
      return { value: tag, label: tag, disabled: !!where, reason: where ? `Already used for ${where}` : undefined };
    }),
    { value: NEW, label: "+ New tag" },
  ];
  const selected = typing ? NEW : known.find((k) => k.toLowerCase() === value.trim().toLowerCase()) ?? "";

  return (
    <ChoiceRow
      label="Tag"
      choices={choices}
      value={selected}
      onChange={(v) => {
        if (v === NEW) {
          setTyping(true);
          onChange("");
          return;
        }
        setTyping(false);
        onChange(v);
      }}
    >
      {typing && (
        <Field
          label="New tag"
          placeholder="e.g. Mom's place"
          value={value}
          autoFocus
          maxLength={40}
          error={clash ? `You already have an address tagged "${clash}"` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </ChoiceRow>
  );
}
