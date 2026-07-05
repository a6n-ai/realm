"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@realm/ui/command";
import { SECTIONS } from "@/components/dashboard/app-sidebar";
import { globalSearch, type SearchResults } from "@/app/(dashboard)/dashboard/search-actions";
import { useQuickAdd, type QuickAddKind } from "@/components/dashboard/quick-add-provider";

// Nav pages that have a global add-popup. Staff-only.
const ADD_KIND: Record<string, QuickAddKind> = {
  "/dashboard/orders": "order",
  "/dashboard/inquiries": "inquiry",
  "/dashboard/customers": "customer",
};

const EMPTY: SearchResults = { orders: [], customers: [], inquiries: [], tickets: [] };

const GROUPS = [
  { key: "orders", heading: "Orders" },
  { key: "customers", heading: "Customers" },
  { key: "inquiries", heading: "Inquiries" },
  { key: "tickets", heading: "Tickets" },
] as const;

export function GlobalSearch({ role }: { role: string }) {
  const router = useRouter();
  const quickAdd = useQuickAdd();
  const isStaff = role === "admin" || role === "member";
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);

  // ⌘K / Ctrl-K focuses the search (no modal — the palette is inline now).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Debounced server search; staff-only entities (action fails closed otherwise).
  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim().length < 2) {
        setResults(EMPTY);
        return;
      }
      globalSearch(query).then(setResults).catch(() => setResults(EMPTY));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
      router.push(href);
    },
    [router],
  );

  const openAdd = useCallback(
    (kind: QuickAddKind) => {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
      quickAdd?.(kind);
    },
    [quickAdd],
  );

  const navItems = SECTIONS.flatMap((s) => s.items)
    .filter((i) => i.roles.includes(role))
    .filter((i) => !query || i.title.toLowerCase().includes(query.toLowerCase()));

  const hasEntity = GROUPS.some((g) => results[g.key].length > 0);
  const showDropdown = open && query.trim().length >= 2;

  return (
    <div className="relative w-full max-w-md">
      <Command shouldFilter={false} className="overflow-visible bg-transparent">
        <CommandInput
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Search pages, orders, customers, tickets, or paste an id…"
        />
        {showDropdown && (
          <CommandList
            // Keep input focused when clicking a result, so onBlur doesn't close
            // the list before onSelect fires (the standard combobox mousedown trick).
            onMouseDown={(e) => e.preventDefault()}
            className="bg-popover text-popover-foreground absolute top-full z-50 mt-1 max-h-[60vh] w-full overflow-y-auto rounded-lg border p-1 shadow-md"
          >
            {navItems.length === 0 && !hasEntity && <CommandEmpty>No results found.</CommandEmpty>}
            {navItems.length > 0 && (
              <CommandGroup heading="Navigation">
                {navItems.map((i) => {
                  const addKind = isStaff && quickAdd ? ADD_KIND[i.href] : undefined;
                  return (
                    <CommandItem key={i.href} value={`nav:${i.title}`} onSelect={() => go(i.href)}>
                      <i.icon />
                      {i.title}
                      {addKind && (
                        <button
                          type="button"
                          aria-label={`Add ${i.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            openAdd(addKind);
                          }}
                          className="text-muted-foreground hover:bg-primary/12 hover:text-primary ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors"
                        >
                          <PlusIcon className="size-3.5" />
                          Add
                        </button>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {GROUPS.map((g) =>
              results[g.key].length > 0 ? (
                <CommandGroup key={g.key} heading={g.heading}>
                  {results[g.key].map((h) => (
                    <CommandItem key={h.id} value={`${g.key}:${h.id}`} onSelect={() => go(h.href)}>
                      <span className="truncate">{h.label}</span>
                      {h.sub && <span className="text-muted-foreground ml-auto truncate text-xs">{h.sub}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null,
            )}
          </CommandList>
        )}
      </Command>
    </div>
  );
}
