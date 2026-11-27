import { chipsFrom, type Facet, withoutKey } from "@foundry/console/filters";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@foundry/ui/dropdown-menu";
import { ListFilterIcon, XIcon } from "lucide-react";
import { type Suggestion, suggestionsFor } from "./suggestions";

type Search = Record<string, unknown>;

// Vercel's filter row: Add Filter, the filters in force, then dashed suggestions that become filters when clicked.
export function FilterBar({
  facets,
  value,
  onChange: emit,
  prefer,
  reset = ["page"],
}: {
  facets: Facet[];
  value: Search;
  onChange: (next: Search) => void;
  prefer?: Record<string, string>;
  reset?: string[];
}) {
  const onChange = (next: Search) => {
    const out = { ...next };
    for (const k of reset) delete out[k];
    emit(out);
  };
  const chips = chipsFrom(value, facets);
  const suggestions = suggestionsFor(facets, value, prefer);
  const apply = (s: Suggestion) => onChange({ ...value, [s.key]: s.value });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          <ListFilterIcon />
          Add Filter
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {facets.map((f) => (
            <DropdownMenuGroup key={f.key}>
              <DropdownMenuLabel>{f.label}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={typeof value[f.key] === "string" ? (value[f.key] as string) : ""}
                onValueChange={(v) => onChange(v ? { ...value, [f.key]: String(v) } : withoutKey(value, f.key))}
              >
                <DropdownMenuRadioItem value="">Any</DropdownMenuRadioItem>
                {f.options.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value}>
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {chips.map((c) => (
        <Badge key={c.key} variant="outline" className="gap-1 pr-1">
          {c.label}: {c.valueLabel}
          <button type="button" aria-label={`Remove ${c.label} filter`} className="rounded-full p-0.5 hover:bg-muted" onClick={() => onChange(withoutKey(value, c.key))}>
            <XIcon />
          </button>
        </Badge>
      ))}
      {suggestions.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => apply(s)}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed px-3 text-xs text-muted-foreground outline-none hover:border-solid hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {s.label}
          <span className="text-foreground">{s.valueLabel}</span>
        </button>
      ))}
      {chips.length > 0 ? (
        <Button variant="ghost" onClick={() => onChange(chips.reduce((s, c) => withoutKey(s, c.key), value))}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}
