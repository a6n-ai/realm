"use server";

import type { FacetDef } from "@/components/ds";
import type { FilterPreset } from "@/lib/list/presets";
import { filterRecommendations, recordFilterUse } from "./filter-usage.service";

export async function recordFilterUseAction(path: string, query: string, fields: string[]): Promise<void> {
  await recordFilterUse(path, query, fields);
}

export async function filterRecommendationsAction(path: string, spec: FacetDef[]): Promise<FilterPreset[]> {
  return filterRecommendations(path, spec);
}
