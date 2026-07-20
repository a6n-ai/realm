"use client";

import type { ReactNode } from "react";
import {
  ADDRESS_FIELD_AUTOCOMPLETE,
  ADDRESS_FIELD_LABELS,
  ADDRESS_FIELD_PLACEHOLDERS,
  ADDRESS_FIELD_PRESETS,
  CANADIAN_PROVINCES,
  NO_PROVINCE,
  type AddressFieldKey,
  type AddressFieldPreset,
  type AddressValues,
} from "@realm/commons";
import { cn } from "./cn";
import { Input } from "./input";
import { Label } from "./label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

const FULL_WIDTH_FIELDS = new Set<AddressFieldKey>(["addressLine", "fullName"]);

export type AddressFieldsProps = {
  values: AddressValues;
  onChange: (patch: Partial<AddressValues>) => void;
  preset?: AddressFieldPreset;
  fields?: readonly AddressFieldKey[];
  idPrefix?: string;
  errors?: Partial<Record<AddressFieldKey, string>>;
  disabled?: boolean;
  className?: string;
  /** Rendered after the postal code row (e.g. zone check button / served banner). */
  postalSlot?: ReactNode;
  onPostalBlur?: () => void;
};

function resolveFields(preset: AddressFieldPreset | undefined, fields: readonly AddressFieldKey[] | undefined) {
  return fields ?? ADDRESS_FIELD_PRESETS[preset ?? "profile"];
}

export function AddressFields({
  values,
  onChange,
  preset = "profile",
  fields,
  idPrefix = "address",
  errors = {},
  disabled = false,
  className,
  postalSlot,
  onPostalBlur,
}: AddressFieldsProps) {
  const resolvedFields = resolveFields(preset, fields);

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {resolvedFields.map((field) => {
        const id = `${idPrefix}-${field}`;
        const error = errors[field];
        const spanClass = FULL_WIDTH_FIELDS.has(field) ? "sm:col-span-2" : undefined;

        if (field === "province") {
          return (
            <div key={field} className={cn("grid gap-1.5", spanClass)}>
              <Label htmlFor={id}>{ADDRESS_FIELD_LABELS.province}</Label>
              <Select
                value={values.province || undefined}
                onValueChange={(v) => onChange({ province: v === NO_PROVINCE ? "" : v })}
                disabled={disabled}
              >
                <SelectTrigger id={id} className="w-full">
                  <SelectValue placeholder="Select province" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROVINCE}>No province</SelectItem>
                  {CANADIAN_PROVINCES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
          );
        }

        const isPostal = field === "postalCode";

        return (
          <div key={field} className={cn("grid gap-1.5", spanClass)}>
            <Label htmlFor={id}>{ADDRESS_FIELD_LABELS[field]}</Label>
            <Input
              id={id}
              autoComplete={ADDRESS_FIELD_AUTOCOMPLETE[field]}
              placeholder={ADDRESS_FIELD_PLACEHOLDERS[field]}
              className={isPostal ? "tabular-nums" : undefined}
              value={values[field] ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ [field]: e.target.value })}
              onBlur={isPostal ? onPostalBlur : undefined}
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {isPostal && postalSlot ? <div className="sm:col-span-2">{postalSlot}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
