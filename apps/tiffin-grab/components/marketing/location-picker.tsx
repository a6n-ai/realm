"use client";

import { LocationPicker as SharedLocationPicker } from "@realm/design-system";
import { detectFranchiseByIp, listLocationsAction } from "@/lib/tenant/detect-location";

// Thin per-app wrapper: the popup/picker UI and cookie logic live in
// @realm/design-system (shared with puchkaman, the other multi-franchise
// app); this just supplies tiffin-grab's own server actions.
export function LocationPicker() {
  return <SharedLocationPicker fetchLocations={listLocationsAction} detectSuggestion={detectFranchiseByIp} />;
}
