"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SECTIONS } from "@/components/dashboard/app-sidebar";
import { globalSearch, type SearchResults } from "@/app/(dashboard)/dashboard/search-actions";

const EMPTY: SearchResults = { orders: [], customers: [], inquiries: [] };

export function GlobalSearch({ role }: { role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);

  // ⌘K / Ctrl-K toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
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
      router.push(href);
    },
    [router],
  );

  const navItems = SECTIONS.flatMap((s) => s.items)
    .filter((i) => i.roles.includes(role))
    .filter((i) => !query || i.title.toLowerCase().includes(query.toLowerCase()));

  const hasResults =
    navItems.length > 0 ||
    results.orders.length > 0 ||
    results.customers.length > 0 ||
    results.inquiries.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-muted/50 text-muted-foreground hover:bg-muted flex h-8 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors sm:w-56"
      >
        <SearchIcon className="size-4 shrink-0" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="bg-background text-muted-foreground ml-auto hidden rounded border px-1.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Search pages, orders, customers, and inquiries"
      >
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search pages, orders, customers…" />
          <CommandList>
            {!hasResults && <CommandEmpty>No results found.</CommandEmpty>}
            {navItems.length > 0 && (
              <CommandGroup heading="Navigation">
                {navItems.map((i) => (
                  <CommandItem key={i.href} value={`nav:${i.title}`} onSelect={() => go(i.href)}>
                    <i.icon />
                    {i.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.orders.length > 0 && (
              <CommandGroup heading="Orders">
                {results.orders.map((h) => (
                  <CommandItem key={h.id} value={`order:${h.id}`} onSelect={() => go(h.href)}>
                    <span className="truncate">{h.label}</span>
                    {h.sub && <span className="text-muted-foreground ml-auto truncate text-xs">{h.sub}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.customers.length > 0 && (
              <CommandGroup heading="Customers">
                {results.customers.map((h) => (
                  <CommandItem key={h.id} value={`customer:${h.id}`} onSelect={() => go(h.href)}>
                    <span className="truncate">{h.label}</span>
                    {h.sub && <span className="text-muted-foreground ml-auto truncate text-xs">{h.sub}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.inquiries.length > 0 && (
              <CommandGroup heading="Inquiries">
                {results.inquiries.map((h) => (
                  <CommandItem key={h.id} value={`inquiry:${h.id}`} onSelect={() => go(h.href)}>
                    <span className="truncate">{h.label}</span>
                    {h.sub && <span className="text-muted-foreground ml-auto truncate text-xs">{h.sub}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
