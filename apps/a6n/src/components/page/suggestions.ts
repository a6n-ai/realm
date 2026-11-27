import type { Facet } from "@foundry/console/filters";

export type Suggestion = { key: string; label: string; value: string; valueLabel: string };

// One suggestion per facet that is not filtered yet: the preferred option when it exists, else the first.
export function suggestionsFor(facets: Facet[], search: Record<string, unknown>, prefer: Record<string, string> = {}): Suggestion[] {
  return facets.flatMap((f) => {
    if (typeof search[f.key] === "string" && search[f.key]) return [];
    const option = f.options.find((o) => o.value === prefer[f.key]) ?? f.options[0];
    return option ? [{ key: f.key, label: f.label, value: option.value, valueLabel: option.label }] : [];
  });
}
