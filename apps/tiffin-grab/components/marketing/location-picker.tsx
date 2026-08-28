"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { ResponsiveDialog } from "@realm/design-system";
import type { FranchiseLocation } from "@/lib/services/organizations.service";
import { detectFranchiseByIp, listLocationsAction } from "@/lib/tenant/detect-location";

const COOKIE_NAME = "franchise";
const COOKIE_MAX_AGE_DAYS = 365;

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeFranchiseCookie(clientCode: string) {
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(clientCode)}; path=/; max-age=${maxAge}; samesite=lax`;
}

// Mounted once in (marketing)/layout.tsx. First visit (no `franchise` cookie):
// silently IP-geolocates and, on a city match, offers a confirm/change popup.
// Any visit can reopen the "change" list via the header's "Deliver to" button
// (id="location-picker-trigger", clicked programmatically — see site-header).
export function LocationPicker() {
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<FranchiseLocation | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [locations, setLocations] = useState<FranchiseLocation[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (readCookie(COOKIE_NAME)) return;
    detectFranchiseByIp().then((match) => {
      if (match) {
        setSuggestion(match);
        setShowSuggestion(true);
      } else {
        setShowPicker(true);
      }
    });
  }, []);

  useEffect(() => {
    const openPicker = () => {
      setShowSuggestion(false);
      setShowPicker(true);
    };
    document.addEventListener("open-location-picker", openPicker);
    return () => document.removeEventListener("open-location-picker", openPicker);
  }, []);

  useEffect(() => {
    if (showPicker && locations === null) listLocationsAction().then(setLocations);
  }, [showPicker, locations]);

  function selectLocation(loc: FranchiseLocation) {
    writeFranchiseCookie(loc.clientCode);
    setShowSuggestion(false);
    setShowPicker(false);
    router.refresh();
  }

  const filtered = (locations ?? []).filter((l) => {
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
        description="Search by city or address, or pick from the list."
      >
        <div className="space-y-3 p-4">
          <Input
            autoFocus
            placeholder="Search by city or address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="space-y-1">
            {filtered.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => selectLocation(loc)}
                className="flex w-full flex-col items-start rounded-lg border p-3 text-left hover:bg-muted"
              >
                <span className="font-medium">{loc.name}</span>
                <span className="text-sm text-muted-foreground">{loc.address ?? loc.city}</span>
              </button>
            ))}
            {locations !== null && filtered.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No locations match &quot;{query}&quot;.</p>
            )}
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}
