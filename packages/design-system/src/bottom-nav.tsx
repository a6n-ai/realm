"use client";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";

export type BottomNavItem = { title: string; href: string; icon: LucideIcon; active: boolean };
export type BottomNavFab = { label: string; icon: LucideIcon; href: string };

// Mobile-only fixed bottom tab bar with an optional raised center FAB. Presentational
// only — the app injects role-filtered items + the per-route FAB. Hidden at md+.
export function BottomNav({ items, fab }: { items: BottomNavItem[]; fab?: BottomNavFab }) {
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);
  const Tab = ({ it }: { it: BottomNavItem }) => (
    <Link
      href={it.href}
      aria-current={it.active ? "page" : undefined}
      className={cn(
        "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs",
        it.active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <it.icon className="size-5" />
      <span className="truncate">{it.title}</span>
    </Link>
  );
  return (
    <nav className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch">
        {left.map((it) => <Tab key={it.href} it={it} />)}
        {fab && (
          <div className="flex w-16 shrink-0 items-center justify-center">
            <Link
              href={fab.href}
              aria-label={fab.label}
              className="bg-primary text-primary-foreground -mt-6 flex size-14 items-center justify-center rounded-full shadow-lg"
            >
              <fab.icon className="size-6" />
            </Link>
          </div>
        )}
        {right.map((it) => <Tab key={it.href} it={it} />)}
      </div>
    </nav>
  );
}
