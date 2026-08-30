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

const DEBOUNCE_MS = 250;

// Local shapes for the resolve/suggest API responses — kept minimal here
// instead of depending on @realm/places (a server-flavored package) from
// this floor-layer package.
export type AddressSuggestion = { placeId: string; label: string };
export type ResolvedPlaceFields = {
  lat: number;
  lng: number;
  addressLine?: string;
  city?: string;
  province?: string;
  postalCode?: string;
};

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
  /**
   * When `resolveUrl` is supplied, the address-line field becomes a debounced
   * autocomplete: typing calls `${resolveUrl}/../suggest`-shaped suggest
   * endpoint (see `suggestUrl`), picking a suggestion resolves it. `onResolve`
   * is optional — pass it only if the caller needs the resolved coordinates.
   * Omit `resolveUrl` to keep today's plain input.
   */
  onResolve?: (place: { lat: number; lng: number }) => void;
  /** App's resolve API route (POST { placeId, address } -> { place }). */
  resolveUrl?: string;
  /** App's suggest API route (POST { query } -> { suggestions }). Defaults to
   *  `resolveUrl` with its last path segment swapped for "suggest". */
  suggestUrl?: string;
};

function resolveFields(preset: AddressFieldPreset | undefined, fields: readonly AddressFieldKey[] | undefined) {
  return fields ?? ADDRESS_FIELD_PRESETS[preset ?? "profile"];
}

export function deriveSuggestUrl(resolveUrl: string): string {
  return resolveUrl.replace(/\/[^/]+$/, "/suggest");
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
  const resolvedFields = resolveFields(preset, fields);
  const autocompleteEnabled = Boolean(resolveUrl);

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

        if (field === "addressLine" && autocompleteEnabled) {
          return (
            <div key={field} className={cn("grid gap-1.5", spanClass)}>
              <Label htmlFor={id}>{ADDRESS_FIELD_LABELS.addressLine}</Label>
              <AddressLineAutocomplete
                id={id}
                value={values.addressLine ?? ""}
                disabled={disabled}
                resolveUrl={resolveUrl!}
                suggestUrl={suggestUrl ?? deriveSuggestUrl(resolveUrl!)}
                onChange={(v) => onChange({ addressLine: v })}
                onResolve={(place) => {
                  const { lat, lng, ...structured } = place;
                  onChange(structured);
                  if (onResolve) onResolve({ lat, lng });
                }}
              />
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
          );
        }

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

/**
 * Debounced address-line autocomplete: same 250ms debounce, arrow-key nav,
 * Escape-closes, stale-response guard as puchkaman's bespoke
 * `AddressAutocomplete`, restyled onto this component's shadcn Input/Label.
 */
export function AddressLineAutocomplete({
  id,
  value,
  disabled,
  resolveUrl,
  suggestUrl,
  onChange,
  onResolve,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  resolveUrl: string;
  suggestUrl: string;
  onChange: (value: string) => void;
  onResolve: (place: ResolvedPlaceFields) => void;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards a stale response (from an earlier keystroke) landing after a
  // newer one and clobbering the dropdown with outdated suggestions.
  const requestIdRef = useRef(0);
  const listId = `${id}-suggestions`;
  const optionId = (s: AddressSuggestion) => `${id}-option-${s.placeId}`;
  const activeId = activeIndex >= 0 ? optionId(suggestions[activeIndex]!) : undefined;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function scheduleFetch(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      requestIdRef.current++;
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      try {
        const res = await fetch(suggestUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed }),
        });
        const body = (await res.json().catch(() => null)) as { suggestions?: AddressSuggestion[] } | null;
        if (requestId !== requestIdRef.current) return;
        const next = body?.suggestions ?? [];
        setSuggestions(next);
        setOpen(next.length > 0);
        setActiveIndex(-1);
      } catch {
        // A failed typeahead request is silent — the plain input still submits.
      }
    }, DEBOUNCE_MS);
  }

  async function pick(suggestion: AddressSuggestion) {
    onChange(suggestion.label);
    requestIdRef.current++;
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    try {
      const res = await fetch(resolveUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: suggestion.label, placeId: suggestion.placeId }),
      });
      const body = (await res.json().catch(() => null)) as
        | { place?: ResolvedPlaceFields | null }
        | null;
      if (body?.place) onResolve(body.place);
    } catch {
      // A failed resolve leaves lat/lng unset — the typed address still submits.
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        void pick(suggestions[activeIndex]!);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        autoComplete={ADDRESS_FIELD_AUTOCOMPLETE.addressLine}
        placeholder={ADDRESS_FIELD_PLACEHOLDERS.addressLine}
        value={value}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-activedescendant={activeId}
        onChange={(e) => {
          onChange(e.target.value);
          scheduleFetch(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 w-full rounded-lg border border-input bg-popover p-1 shadow-md"
        >
          {suggestions.map((suggestion, i) => (
            <li
              key={suggestion.placeId}
              id={optionId(suggestion)}
              role="option"
              aria-selected={i === activeIndex}
              className={cn(
                "cursor-pointer rounded-md px-2 py-1.5 text-sm",
                i === activeIndex ? "bg-accent text-accent-foreground" : undefined,
              )}
              // onMouseDown (not onClick) fires before the input's onBlur, so
              // the pick registers before the dropdown closes itself away.
              onMouseDown={(e) => {
                e.preventDefault();
                void pick(suggestion);
              }}
            >
              {suggestion.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
