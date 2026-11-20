/* eslint-disable */
"use client";

import { isStaffRole } from "@/lib/roles";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { BoxIcon, InboxIcon, LifeBuoyIcon, PlusIcon, SearchIcon, UsersIcon, type LucideIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@foundry/ui/command";
import { Kbd } from "@foundry/ui/kbd";
import { useSidebar } from "@foundry/ui/sidebar";
import { SECTIONS } from "@/components/dashboard/app-sidebar";
import { useNavAllowed } from "@/components/dashboard/nav-access-provider";
import { globalSearch, type SearchResults } from "@/app/(dashboard)/dashboard/search-actions";
import { useQuickAdd, type QuickAddKind } from "@/components/dashboard/quick-add-provider";

// Nav pages that have a global add-popup. Staff-only.
const ADD_KIND: Record<string, QuickAddKind> = {
  "/dashboard/orders": "order",
  "/dashboard/inquiries": "inquiry",
  "/dashboard/customers": "customer",
};

const EMPTY: SearchResults = { orders: [], customers: [], inquiries: [], tickets: [] };

const GROUPS: { key: keyof SearchResults; kind: string; icon: LucideIcon }[] = [
  { key: "orders", kind: "Order", icon: BoxIcon },
  { key: "customers", kind: "Customer", icon: UsersIcon },
  { key: "inquiries", kind: "Inquiry", icon: InboxIcon },
  { key: "tickets", kind: "Ticket", icon: LifeBuoyIcon },
];

// Subtitle names the group: a section's pages carry the section title, the rest "Navigation".
const NAV_ROWS = SECTIONS.flatMap((s) =>
  s.items.flatMap((i) => (i.children ?? [i]).map((item) => ({ item, section: i.children ? i.title : "Navigation" }))),
);

const PANEL_WIDTH = 384;
const EDGE = 4;

function Row({
  icon: Icon,
  title,
  subtitle,
  value,
  onSelect,
  add,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  value: string;
  onSelect: () => void;
  add?: { label: string; onClick: () => void };
}) {
  return (
    <CommandItem value={value} onSelect={onSelect} className="h-12 gap-3 rounded-md px-3 py-0">
      <Icon className="text-muted-foreground size-4" strokeWidth={1.5} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm">{title}</span>
        {subtitle && <span className="text-muted-foreground truncate text-[13px]">{subtitle}</span>}
      </span>
      {add && (
        <button
          type="button"
          aria-label={add.label}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            add.onClick();
          }}
          className="text-muted-foreground hover:bg-primary/12 hover:text-primary ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium"
        >
          <PlusIcon className="size-3.5" />
          Add
        </button>
      )}
    </CommandItem>
  );
}

export function GlobalSearch({ role }: { role: string }) {
  const router = useRouter();
  const quickAdd = useQuickAdd();
  const isStaff = isStaffRole(role);
  const navAllowed = useNavAllowed();
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const { state: sidebarState, setOpen: setSidebarOpen } = useSidebar();
  // Find's text is its own: the lists' ?q= belongs to each list's search box, so nothing is mirrored into the URL.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  // Controlled so the root re-renders on every move: cmdk only refreshes aria-activedescendant on root render.
  const [highlight, setHighlight] = useState("");

  const openPanel = useCallback(() => {
    const active = document.activeElement;
    returnRef.current = active instanceof HTMLElement && active !== document.body ? active : triggerRef.current;
    setOpen(true);
  }, []);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) (returnRef.current?.isConnected ? returnRef.current : triggerRef.current)?.focus();
  }, []);

  // ⌘K / Ctrl-K opens the panel. Bare F does too, but never while the user is typing somewhere else.
  useEffect(() => {
    // A collapsed sidebar is inert and off screen: open it, then open the panel once the frame has laid it out.
    const openFind = () => {
      if (sidebarState === "collapsed" && triggerRef.current?.closest('[data-slot="sidebar-container"]')) {
        setSidebarOpen(true);
        requestAnimationFrame(openPanel);
        return;
      }
      openPanel();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openFind();
        return;
      }
      const t = e.target;
      const typing = t instanceof HTMLElement && (t.isContentEditable || t.matches("input, textarea, select"));
      const inOverlay = t instanceof Element && t.closest("[role=menu],[role=listbox],[role=dialog]") !== null;
      if (
        e.key.toLowerCase() === "f" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.isComposing &&
        !e.defaultPrevented &&
        !typing &&
        !inOverlay
      ) {
        e.preventDefault();
        openFind();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarState, setSidebarOpen, openPanel]);

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
      close(false);
      router.push(href);
    },
    [router, close],
  );

  const openAdd = useCallback(
    (kind: QuickAddKind) => {
      close(false);
      quickAdd?.(kind);
    },
    [quickAdd, close],
  );

  const navRows = NAV_ROWS.filter(({ item }) => navAllowed(item.href)).filter(
    ({ item }) => !query || item.title.toLowerCase().includes(query.toLowerCase()),
  );
  const hasEntity = GROUPS.some((g) => results[g.key].length > 0);

  // The sidebar clips overflow, so the panel is a fixed layer placed over the field from its rect.
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 2 * EDGE);
      const left = Math.max(EDGE, Math.min(r.left - EDGE, window.innerWidth - EDGE - width));
      setAnchor({ top: Math.max(EDGE, r.top - EDGE), left, width });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  const placed = open && anchor !== null;
  useEffect(() => {
    if (placed) inputRef.current?.focus();
  }, [placed]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Find"
        aria-haspopup="dialog"
        onClick={openPanel}
        className="tg-find text-muted-foreground flex h-10 w-full items-center gap-2 rounded-(--ui-radius-control) border bg-muted/40 px-3 text-sm"
      >
        <SearchIcon className="size-4 shrink-0 opacity-50" strokeWidth={1.5} />
        <span className="flex-1 text-left">Find</span>
        <kbd aria-hidden className="rounded border px-1.5 font-mono text-xs">F</kbd>
      </button>
      {open && anchor && createPortal(
        <>
          <div data-slot="find-backdrop" className="fixed inset-0 z-50 bg-(--ui-modal-backdrop)" onMouseDown={() => close()} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Find"
            style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
            className="tg-find-panel bg-popover text-popover-foreground fixed z-50 flex max-h-[min(60vh,28rem)] flex-col overflow-hidden rounded-(--ui-radius-popup) border shadow-(--ui-shadow-popup)"
          >
            <Command
              shouldFilter={false}
              value={highlight}
              onValueChange={setHighlight}
              className="min-h-0 overflow-visible bg-transparent p-0 [&_[data-slot=input-group-addon]_svg]:[stroke-width:1.5]"
            >
              <div className="relative border-b">
                <CommandInput
                  ref={inputRef}
                  aria-label="Find"
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Find"
                />
                <Kbd aria-hidden className="absolute top-3.5 right-3">Esc</Kbd>
              </div>
              <CommandList
                // Keep the input focused when clicking a row, so selection fires before any blur.
                onMouseDown={(e) => e.preventDefault()}
                className="max-h-none flex-1 p-2"
              >
                {navRows.length === 0 && !hasEntity && <CommandEmpty>No results for “{query}”</CommandEmpty>}
                {navRows.map(({ item, section }) => {
                  const addKind = isStaff && quickAdd ? ADD_KIND[item.href] : undefined;
                  return (
                    <Row
                      key={item.href}
                      value={`nav:${item.title}`}
                      icon={item.icon}
                      title={item.title}
                      subtitle={section}
                      onSelect={() => go(item.href)}
                      add={addKind ? { label: `Add ${item.title}`, onClick: () => openAdd(addKind) } : undefined}
                    />
                  );
                })}
                {GROUPS.flatMap((g) =>
                  results[g.key].map((h) => (
                    <Row
                      key={`${g.key}:${h.id}`}
                      value={`${g.key}:${h.id}`}
                      icon={g.icon}
                      title={h.label}
                      subtitle={h.sub ? `${g.kind} · ${h.sub}` : g.kind}
                      onSelect={() => go(h.href)}
                    />
                  )),
                )}
              </CommandList>
            </Command>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
