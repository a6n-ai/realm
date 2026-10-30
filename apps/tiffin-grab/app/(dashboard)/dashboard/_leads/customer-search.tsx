"use client";

import { useEffect, useState } from "react";
import { UserRoundIcon, XIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import {
  Command, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@foundry/ui/command";
import { formatPhone } from "@foundry/commons";
import { searchCustomers, type CustomerHit } from "./match-actions";

/** Step-1 typeahead: find an existing customer by name or phone and prefill the
 * contact fields. Free text is fine — if nothing matches, the staffer just keeps
 * typing the new customer's details below. */
export function CustomerSearch({ onPick }: { onPick: (c: CustomerHit) => void }) {
  const [q, setQ] = useState("");
  // Results carry the query they belong to, so "no results yet" is derived rather
  // than written synchronously in the effect — and a stale list can never show.
  const [found, setFound] = useState<{ q: string; items: CustomerHit[] }>({ q: "", items: [] });
  const term = q.trim().replace(/\s+/g, " ");
  const hits = found.q === term ? found.items : [];

  useEffect(() => {
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      try { setFound({ q: term, items: await searchCustomers(term) }); }
      catch { setFound({ q: term, items: [] }); }
    }, 300);
    return () => clearTimeout(t);
  }, [term]);

  return (
    // A plain field, not a panel: Command's popover chrome and the input wrapper's padding are stripped so
    // the input lines up with the form's other fields, and results drop down over the form instead of pushing it.
    <Command shouldFilter={false} className="relative h-auto overflow-visible bg-transparent p-0 [&_[data-slot=command-input-wrapper]]:p-0 [&_[data-slot=input-group]]:border-input [&_[data-slot=input-group]]:bg-transparent dark:[&_[data-slot=input-group]]:bg-input/30">
      <CommandInput
        placeholder="Search existing customer by name or phone…"
        value={q}
        onValueChange={setQ}
        onKeyDown={(e) => { if (e.key === "Escape" && q) { e.preventDefault(); e.stopPropagation(); setQ(""); } }}
        className={q ? "pr-7" : undefined}
      />
      {q && (
        // Over the input's right edge: CommandInput has no end slot. Escape clears too, without closing the sheet.
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Clear search" className="absolute top-1 right-1" onClick={() => setQ("")}>
          <XIcon />
        </Button>
      )}
      {hits.length > 0 && (
        <CommandList className="bg-popover text-popover-foreground absolute inset-x-0 top-full z-50 mt-1 max-h-52 rounded-lg border p-1 shadow-md">
          <CommandGroup heading="Existing customers">
            {hits.map((c) => (
              <CommandItem
                key={c.publicId}
                value={c.publicId}
                onSelect={() => { onPick(c); setQ(""); }}
                className="gap-2"
              >
                <UserRoundIcon className="size-4 opacity-60" />
                <div className="grid min-w-0">
                  <span className="truncate font-medium">{c.fullName ?? "Customer"}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {formatPhone(c.phone)}{c.email ? ` · ${c.email}` : ""}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      )}
    </Command>
  );
}
