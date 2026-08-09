"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { PlaceSuggestion } from "@realm/places";

const DEBOUNCE_MS = 250;

/**
 * Plain input + a debounced fetch to the server-side suggest route (cheapest
 * Places bucket — never returns coordinates, resolve() does that separately).
 * Degrades gracefully: a typed address with no suggestion picked still
 * submits, `placeId` stays optional everywhere downstream.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onPick,
  id,
  className = "input",
}: {
  value: string;
  onChange: (address: string) => void;
  onPick: (result: { address: string; placeId: string }) => void;
  id?: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a stale response (from an earlier keystroke) landing after
  // a newer one and clobbering the dropdown with outdated suggestions.
  const requestIdRef = useRef(0);
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-suggestions`;
  const optionId = (suggestion: PlaceSuggestion) => `${inputId}-option-${suggestion.placeId}`;
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
        const res = await fetch("/api/delivery/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed }),
        });
        const body = (await res.json().catch(() => null)) as { suggestions?: PlaceSuggestion[] } | null;
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

  function pick(suggestion: PlaceSuggestion) {
    onChange(suggestion.label);
    onPick({ address: suggestion.label, placeId: suggestion.placeId });
    requestIdRef.current++;
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
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
        pick(suggestions[activeIndex]!);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="address-suggest">
      <input
        id={inputId}
        className={className}
        value={value}
        autoComplete="street-address"
        placeholder="Street, city, postal code"
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
      {open && suggestions.length > 0 && (
        <ul id={listId} role="listbox" className="address-suggest__list">
          {suggestions.map((suggestion, i) => (
            <li
              key={suggestion.placeId}
              id={optionId(suggestion)}
              role="option"
              aria-selected={i === activeIndex}
              className="address-suggest__item"
              // onMouseDown (not onClick) fires before the input's onBlur, so
              // the pick registers before the dropdown closes itself away.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(suggestion);
              }}
            >
              {suggestion.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
