"use client";

import type { ReactNode } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import {
  ADDRESS_FIELD_AUTOCOMPLETE,
  ADDRESS_FIELD_LABELS,
  ADDRESS_FIELD_PLACEHOLDERS,
  ADDRESS_FIELD_PRESETS,
  CANADIAN_PROVINCES,
  NO_PROVINCE,
  type AddressFieldKey,
  type AddressFieldPreset,
} from "@realm/commons";
import { cn } from "./cn";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./form";
import { Input } from "./input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

const FULL_WIDTH_FIELDS = new Set<AddressFieldKey>(["addressLine", "fullName"]);

export type AddressFormFieldsProps<T extends FieldValues> = {
  control: Control<T>;
  preset?: AddressFieldPreset;
  fields?: readonly AddressFieldKey[];
  className?: string;
  disabled?: boolean;
  postalSlot?: ReactNode;
  onPostalBlur?: () => void;
};

function resolveFields(preset: AddressFieldPreset | undefined, fields: readonly AddressFieldKey[] | undefined) {
  return fields ?? ADDRESS_FIELD_PRESETS[preset ?? "profile"];
}

export function AddressFormFields<T extends FieldValues>({
  control,
  preset = "profile",
  fields,
  className,
  disabled = false,
  postalSlot,
  onPostalBlur,
}: AddressFormFieldsProps<T>) {
  const resolvedFields = resolveFields(preset, fields);

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {resolvedFields.map((field) => {
        const spanClass = FULL_WIDTH_FIELDS.has(field) ? "sm:col-span-2" : undefined;

        if (field === "province") {
          return (
            <FormField
              key={field}
              control={control}
              name={field as FieldPath<T>}
              render={({ field: rhfField }) => (
                <FormItem className={spanClass}>
                  <FormLabel>{ADDRESS_FIELD_LABELS.province}</FormLabel>
                  <Select
                    value={rhfField.value || undefined}
                    onValueChange={(v) => rhfField.onChange(v === NO_PROVINCE ? "" : v)}
                    disabled={disabled}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select province" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_PROVINCE}>No province</SelectItem>
                      {CANADIAN_PROVINCES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          );
        }

        const isPostal = field === "postalCode";

        return (
          <FormField
            key={field}
            control={control}
            name={field as FieldPath<T>}
            render={({ field: rhfField }) => (
              <FormItem className={spanClass}>
                <FormLabel>{ADDRESS_FIELD_LABELS[field]}</FormLabel>
                <FormControl>
                  <Input
                    autoComplete={ADDRESS_FIELD_AUTOCOMPLETE[field]}
                    placeholder={ADDRESS_FIELD_PLACEHOLDERS[field]}
                    className={isPostal ? "tabular-nums" : undefined}
                    disabled={disabled}
                    {...rhfField}
                    onBlur={(e) => {
                      rhfField.onBlur();
                      if (isPostal) onPostalBlur?.();
                    }}
                  />
                </FormControl>
                <FormMessage />
                {isPostal && postalSlot ? <div className="pt-1">{postalSlot}</div> : null}
              </FormItem>
            )}
          />
        );
      })}
    </div>
  );
}
