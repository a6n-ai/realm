"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { ResponsiveDialog } from "@realm/design-system";
import type { FranchiseLocation } from "@/lib/services/organizations.service";
import { detectFranchiseByIp, listLocationsAction } from "@/lib/tenant/detect-location";
import { readFranchiseCookie, writeFranchiseCookie } from "@/lib/tenant/franchise-cookie";

// Mounted once in (marketing)/layout.tsx. Renders nothing at all when there's
// 0 or 1 franchise — a single-location business has nothing to pick between.
// With 2+: first visit (no `franchise` cookie) silently IP-geolocates and, on
// a city match, offers a confirm/change popup; the floating "Deliver to"
// widget reopens the picker anytime, on both desktop and mobile.
export function LocationPicker() {
  const router = useRouter();
  const [locations, setLocations] = useState<FranchiseLocation[] | null>(null);
  const [suggestion, setSuggestion] = useState<FranchiseLocation | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    listLocationsAction().then(setLocations);
  }, []);

  useEffect(() => {
    if (!locations || locations.length < 2) return;
    if (readFranchiseCookie()) return;
    detectFranchiseByIp().then((match) => {
      if (match) {
        setSuggestion(match);
        setShowSuggestion(true);
      } else {
        setShowPicker(true);
      }
    });
  }, [locations]);

  if (!locations || locations.length < 2) return null;

  function selectLocation(loc: FranchiseLocation) {
    writeFranchiseCookie(loc.clientCode);
    setShowSuggestion(false);
    setShowPicker(false);
    router.refresh();
  }

  const filtered = locations.filter((l) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return l.name.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q) || l.address?.toLowerCase().includes(q);
  });

  return (
    <>
      <ResponsiveDialog
        open={showSuggestion}
        onOpenChange={setShowSuggestion}
        title="Serving in your area"
        description={suggestion ? `Order from our ${suggestion.city} location?` : undefined}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { setShowSuggestion(false); setShowPicker(true); }}>
              Change location
            </Button>
            <Button className="flex-1" onClick={() => suggestion && selectLocation(suggestion)}>
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
      >
        <div className="space-y-3 p-4">
          <Input
            autoFocus
            placeholder="Search by city or address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => selectLocation(loc)}
                className="flex flex-col items-start gap-1 rounded-xl border p-3 text-left hover:border-primary hover:bg-muted"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <MapPin className="size-4 shrink-0 text-primary" />
                  {loc.name}
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
        aria-label="Change delivery location"
        className="fixed bottom-4 left-4 z-40 flex items-center gap-1.5 rounded-full border bg-background px-3 py-2 text-sm shadow-lg hover:bg-muted"
      >
        <MapPin className="size-4 text-primary" />
        Deliver to
      </button>
    </>
  );
}
