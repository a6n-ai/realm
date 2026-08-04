"use client";

import { useEffect, useState } from "react";
import { UserRoundIcon } from "lucide-react";
import {
  Command, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@realm/ui/command";
import { searchCustomers, type CustomerHit } from "./match-actions";

/** Step-1 typeahead: find an existing customer by name or phone and prefill the
 * contact fields. Free text is fine — if nothing matches, the staffer just keeps
 * typing the new customer's details below. */
export function CustomerSearch({ onPick }: { onPick: (c: CustomerHit) => void }) {
  const [q, setQ] = useState("");
  // Results carry the query they belong to, so "no results yet" is derived rather
  // than written synchronously in the effect — and a stale list can never show.
  const [found, setFound] = useState<{ q: string; items: CustomerHit[] }>({ q: "", items: [] });
  const term = q.trim();
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
    <Command shouldFilter={false} className="border-border/70 h-auto rounded-lg border">
      <CommandInput
        placeholder="Search existing customer by name or phone…"
        value={q}
        onValueChange={setQ}
      />
      {hits.length > 0 && (
        <CommandList className="max-h-52">
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
                    {c.phone}{c.email ? ` · ${c.email}` : ""}
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
