"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
} from "@foundry/commons";
import { Field, Select } from "@/components/customer/kit";
import { cn, FONT } from "@/components/customer/kit/cn";

const FULL_WIDTH = new Set<AddressFieldKey>(["addressLine", "fullName", "deliveryInstructions"]);
const DEBOUNCE_MS = 250;

type Suggestion = { placeId: string; label: string };
export type ResolvedPlace = { lat: number; lng: number; addressLine?: string; city?: string; province?: string; postalCode?: string };

export const deriveSuggestUrl = (resolveUrl: string) => resolveUrl.replace(/\/[^/]+$/, "/suggest");

export interface AddressFieldsProps {
  values: Partial<AddressValues>;
  onChange: (patch: Partial<AddressValues>) => void;
  preset?: AddressFieldPreset;
  fields?: readonly AddressFieldKey[];
  idPrefix?: string;
  errors?: Partial<Record<AddressFieldKey, string>>;
  disabled?: boolean;
  className?: string;
  postalSlot?: ReactNode;
  onPostalBlur?: () => void;
  onResolve?: (place: { lat: number; lng: number }) => void;
  resolveUrl?: string;
  suggestUrl?: string;
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
  onResolve,
  resolveUrl,
  suggestUrl,
}: AddressFieldsProps) {
  const list = fields ?? ADDRESS_FIELD_PRESETS[preset];
  return (
    <div className={cn(FONT, "grid gap-4 sm:grid-cols-2", className)}>
      {list.map((key) => {
        const id = `${idPrefix}-${key}`;
        const span = FULL_WIDTH.has(key) ? "sm:col-span-2" : undefined;

        if (key === "province") {
          return (
            <div key={key} className={span}>
              <Select
                id={id}
                label={ADDRESS_FIELD_LABELS.province}
                placeholder="Select province"
                options={[{ value: NO_PROVINCE, label: "No province" }, ...CANADIAN_PROVINCES]}
                value={values.province ?? ""}
                disabled={disabled}
                error={errors.province}
                onChange={(e) => onChange({ province: e.target.value === NO_PROVINCE ? "" : e.target.value })}
              />
            </div>
          );
        }

        if (key === "addressLine" && resolveUrl) {
          return (
            <div key={key} className={span}>
              <AddressLineAutocomplete
                id={id}
                value={values.addressLine ?? ""}
                disabled={disabled}
                error={errors.addressLine}
                resolveUrl={resolveUrl}
                suggestUrl={suggestUrl ?? deriveSuggestUrl(resolveUrl)}
                onChange={(v) => onChange({ addressLine: v })}
                onResolve={({ lat, lng, ...structured }) => {
                  onChange(structured);
                  onResolve?.({ lat, lng });
                }}
              />
            </div>
          );
        }

        const isPostal = key === "postalCode";
        return (
          <div key={key} className={cn("flex flex-col gap-2", span)}>
            <Field
              id={id}
              label={ADDRESS_FIELD_LABELS[key]}
              autoComplete={ADDRESS_FIELD_AUTOCOMPLETE[key]}
              placeholder={ADDRESS_FIELD_PLACEHOLDERS[key]}
              className={isPostal ? "tabular-nums" : undefined}
              value={values[key] ?? ""}
              disabled={disabled}
              error={errors[key]}
              onChange={(e) => onChange({ [key]: e.target.value })}
              onBlur={isPostal ? onPostalBlur : undefined}
            />
            {isPostal && postalSlot}
          </div>
        );
      })}
    </div>
  );
}

function AddressLineAutocomplete({
  id,
  value,
  disabled,
  error,
  resolveUrl,
  suggestUrl,
  onChange,
  onResolve,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  error?: string;
  resolveUrl: string;
  suggestUrl: string;
  onChange: (v: string) => void;
  onResolve: (p: ResolvedPlace) => void;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);
  const listId = `${id}-suggestions`;

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function schedule(query: string) {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (!q) {
      reqId.current++;
      setItems([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const mine = ++reqId.current;
      try {
        const res = await fetch(suggestUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
        const body = (await res.json().catch(() => null)) as { suggestions?: Suggestion[] } | null;
        if (mine !== reqId.current) return;
        const next = body?.suggestions ?? [];
        setItems(next);
        setOpen(next.length > 0);
        setActive(-1);
      } catch {
        // typeahead is best-effort; the typed address still submits
      }
    }, DEBOUNCE_MS);
  }

  async function pick(s: Suggestion) {
    onChange(s.label);
    reqId.current++;
    setItems([]);
    setOpen(false);
    setActive(-1);
    try {
      const res = await fetch(resolveUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: s.label, placeId: s.placeId }) });
      const body = (await res.json().catch(() => null)) as { place?: ResolvedPlace | null } | null;
      if (body?.place) onResolve(body.place);
    } catch {
      // failed resolve leaves lat/lng unset
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      void pick(items[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="relative">
      <Field
        id={id}
        label={ADDRESS_FIELD_LABELS.addressLine}
        autoComplete={ADDRESS_FIELD_AUTOCOMPLETE.addressLine}
        placeholder={ADDRESS_FIELD_PLACEHOLDERS.addressLine}
        value={value}
        disabled={disabled}
        error={error}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${id}-option-${items[active]!.placeId}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          schedule(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg">
          {items.map((s, i) => (
            <li
              key={s.placeId}
              id={`${id}-option-${s.placeId}`}
              role="option"
              aria-selected={i === active}
              className={cn("flex min-h-11 cursor-pointer items-center rounded-[10px] px-3 text-[15px]", i === active ? "bg-[var(--muted)]" : "active:bg-[var(--muted)]")}
              // mousedown fires before the input blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                void pick(s);
              }}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
