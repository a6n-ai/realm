"use client";

import dynamic from "next/dynamic";
import type { StaticMap as StaticMapType } from "@foundry/design-system";

// The design-system map imports maplibre-gl (and its CSS) at module scope.
// Loading it through next/dynamic with SSR off keeps that chunk out of the
// Worker. The map already painted only after a client effect.
export const StaticMap = dynamic(
  () => import("@foundry/design-system").then((mod) => mod.StaticMap),
  { ssr: false },
) as typeof StaticMapType;
