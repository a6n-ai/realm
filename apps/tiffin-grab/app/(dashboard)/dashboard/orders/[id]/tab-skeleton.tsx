"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

// The page's Suspense fallback is rendered before the order loads; pick the body that matches the
// tab being opened so ?tab=deliveries doesn't flash the Overview layout first.
export function TabSkeleton({ overview, deliveries }: { overview: ReactNode; deliveries: ReactNode }) {
  return useSearchParams().get("tab") === "deliveries" ? deliveries : overview;
}
