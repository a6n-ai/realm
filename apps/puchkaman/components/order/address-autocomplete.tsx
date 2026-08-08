"use client";

import { useEffect, useId, useRef } from "react";
import { DEFAULT_STORE_LAT, DEFAULT_STORE_LNG } from "@/lib/delivery/distance";

// Loose shape of the bits of the legacy `google.maps.places.Autocomplete`
// widget this component uses — no @types/google.maps in this workspace, and
// pulling it in for one widget isn't worth the dependency.
type PlaceResult = { formatted_address?: string; place_id?: string };
type AutocompleteInstance = {
  addListener: (event: string, handler: () => void) => void;
  getPlace: () => PlaceResult;
};
type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      places?: {
        Autocomplete: new (
          input: HTMLInputElement,
          opts: Record<string, unknown>,
        ) => AutocompleteInstance;
      };
    };
  };
};

const SCRIPT_ID = "google-maps-places-script";
// ponytail: module-scoped singleton promise. Every mount reuses the same
// load, so two autocomplete inputs on one page (or a remount) never inject
// the script twice.
let loadPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const w = window as GoogleMapsWindow;
    if (w.google?.maps?.places) {
      resolve();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    if (!existing) document.head.appendChild(script);
  });
  return loadPromise;
}

/**
 * Places Autocomplete over a plain text input. Degrades to a plain input
 * (still submittable — `placeId` is optional everywhere downstream) when the
 * key is missing or the script fails to load.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const autoId = useId();
  const inputId = id ?? autoId;

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    if (!apiKey || !inputRef.current) return;
    let cancelled = false;
    let autocomplete: AutocompleteInstance | null = null;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current) return;
        const w = window as GoogleMapsWindow;
        const Autocomplete = w.google?.maps?.places?.Autocomplete;
        if (!Autocomplete) return;
        autocomplete = new Autocomplete(inputRef.current, {
          fields: ["formatted_address", "place_id"],
          componentRestrictions: { country: "ca" },
          // Bias (not restrict) toward the shop — a loose box around it,
          // wide enough to cover the scheduled-delivery zone.
          bounds: {
            north: DEFAULT_STORE_LAT + 0.5,
            south: DEFAULT_STORE_LAT - 0.5,
            east: DEFAULT_STORE_LNG + 0.5,
            west: DEFAULT_STORE_LNG - 0.5,
          },
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete?.getPlace();
          if (!place?.place_id) return;
          const address = place.formatted_address ?? inputRef.current?.value ?? "";
          onChange(address);
          onPick({ address, placeId: place.place_id });
        });
      })
      .catch(() => {
        // Script failed to load — the plain input still works fine.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wire the widget once per mount
  }, []);

  return (
    <input
      ref={inputRef}
      id={inputId}
      className={className}
      value={value}
      autoComplete="street-address"
      placeholder="Street, city, postal code"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
