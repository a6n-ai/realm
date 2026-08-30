"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { readFranchiseCookie, writeFranchiseCookie } from "./franchise-cookie";
import { ResponsiveDialog } from "./responsive-dialog";

export type PickableLocation = {
  id: string;
  name: string;
  clientCode: string;
  city: string | null;
  address: string | null;
};

// Generic across apps: each caller supplies its own server actions
// (fetchLocations/detectSuggestion hit that app's DB and ip-api.com), this
// component owns only the popup/picker UI and cookie writing. Mounted once in
// a marketing layout. Renders nothing at all when there's 0 or 1 franchise —
// a single-location business has nothing to pick between. With 2+: first
// visit (no `franchise` cookie) silently IP-geolocates and, on a city match,
// offers a confirm/change popup; the floating "Deliver to" widget reopens the
// picker anytime, on both desktop and mobile.
export function LocationPicker<T extends PickableLocation>({
  fetchLocations,
  detectSuggestion,
}: {
  fetchLocations: () => Promise<T[]>;
  detectSuggestion: () => Promise<T | null>;
}) {
  const router = useRouter();
  const [locations, setLocations] = useState<T[] | null>(null);
  const [suggestion, setSuggestion] = useState<T | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState("");
  // Cookie is the source of truth (proxy.ts reads it server-side too); this
  // state just mirrors it so the FAB/dialog can render the current pick
  // without re-parsing document.cookie on every render.
  const [activeCode, setActiveCode] = useState<string | null>(null);

  useEffect(() => {
    fetchLocations().then(setLocations);
    setActiveCode(readFranchiseCookie());
  }, [fetchLocations]);

  useEffect(() => {
    if (!locations || locations.length < 2) return;
    if (readFranchiseCookie()) return;
    detectSuggestion().then((match) => {
      if (match) {
        setSuggestion(match);
        setShowSuggestion(true);
      } else {
        setShowPicker(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- detectSuggestion is a stable server-action reference per app
  }, [locations]);

  if (!locations || locations.length < 2) return null;

  function selectLocation(loc: T) {
    writeFranchiseCookie(loc.clientCode);
    setActiveCode(loc.clientCode);
    setShowSuggestion(false);
    setShowPicker(false);
    router.refresh();
  }

  const active = locations.find((l) => l.clientCode === activeCode) ?? null;

  const filtered = locations.filter((l) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return l.name.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q) || l.address?.toLowerCase().includes(q);
  });

  return (
    <>
      {/* Bare `location-picker-*` class hooks below are unstyled by default (pure
          Tailwind carries the look) — an app opts in by targeting them in its own
          global stylesheet, e.g. puchkaman's brutalist skin. Adding them here is a
          no-op for every other app. */}
      <ResponsiveDialog
        open={showSuggestion}
        onOpenChange={setShowSuggestion}
        title="Serving in your area"
        description={suggestion ? `Order from our ${suggestion.city} location?` : undefined}
        contentClassName="location-picker-dialog"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="location-picker-btn location-picker-btn--outline flex-1" onClick={() => { setShowSuggestion(false); setShowPicker(true); }}>
              Change location
            </Button>
            <Button className="location-picker-btn flex-1" onClick={() => suggestion && selectLocation(suggestion)}>
              Confirm
            </Button>
          </div>
        }
      >
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
          <MapPin className="size-4" />
          {suggestion?.name}
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        title="Choose your location"
        description="Search by city or address, or pick a card below."
        contentClassName="location-picker-dialog"
      >
        <div className="space-y-3 p-4">
          <Input
            autoFocus
            placeholder="Search by city or address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="location-picker-input"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => selectLocation(loc)}
                aria-pressed={loc.clientCode === activeCode}
                className="location-picker-card flex flex-col items-start gap-1 rounded-xl border p-3 text-left hover:border-primary hover:bg-muted data-[active=true]:border-primary"
                data-active={loc.clientCode === activeCode}
              >
                <span className="flex w-full items-center gap-1.5 font-medium">
                  <MapPin className="size-4 shrink-0 text-primary" />
                  {loc.name}
                  {loc.clientCode === activeCode && <Check className="location-picker-check ml-auto size-4 shrink-0 text-primary" />}
                </span>
                <span className="text-sm text-muted-foreground">{loc.address ?? loc.city}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full p-3 text-sm text-muted-foreground">No locations match &quot;{query}&quot;.</p>
            )}
          </div>
        </div>
      </ResponsiveDialog>

      <button
        type="button"
        onClick={() => setShowPicker(true)}
        aria-label={active ? `Delivering to ${active.name}. Change location.` : "Change delivery location"}
        className="location-picker-fab fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full border bg-background px-3 py-2 text-sm shadow-lg hover:bg-muted"
      >
        <MapPin className="size-4 text-primary" />
        {active ? active.city ?? active.name : "Deliver to"}
      </button>
    </>
  );
}
