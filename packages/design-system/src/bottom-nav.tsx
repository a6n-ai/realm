"use client";
import Link from "next/link";
import { PlusIcon, type LucideIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";

export type BottomNavItem = { title: string; icon: LucideIcon; active: boolean } & (
  | { href: string }
  | { onClick: () => void }
);

// Mobile-only fixed bottom tab bar with an optional raised center FAB. Presentational
// only — the app injects role-filtered items (link or action) + FAB callback. Hidden at md+.
export function BottomNav({
  items,
  onFabClick,
  fabLabel,
}: {
  items: BottomNavItem[];
  onFabClick?: () => void;
  fabLabel?: string;
}) {
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);
  const tabClass = (active: boolean) =>
    cn(
      "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs",
      active ? "text-foreground" : "text-muted-foreground",
    );
  const Tab = ({ it }: { it: BottomNavItem }) =>
    "href" in it ? (
      <Link href={it.href} aria-current={it.active ? "page" : undefined} className={tabClass(it.active)}>
        <it.icon className="size-5" />
        <span className="truncate">{it.title}</span>
      </Link>
    ) : (
      <button
        type="button"
        onClick={it.onClick}
        aria-current={it.active ? "page" : undefined}
        className={tabClass(it.active)}
      >
        <it.icon className="size-5" />
        <span className="truncate">{it.title}</span>
      </button>
    );
  return (
    <nav
      className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-stretch">
        {left.map((it, i) => (
          <Tab key={i} it={it} />
        ))}
        {onFabClick && (
          <div className="flex w-16 shrink-0 items-center justify-center">
            <button
              type="button"
              onClick={onFabClick}
              aria-label={fabLabel ?? "Create"}
              className="bg-primary text-primary-foreground -mt-6 flex size-14 items-center justify-center rounded-full shadow-lg"
            >
              <PlusIcon className="size-6" />
            </button>
          </div>
        )}
        {right.map((it, i) => (
          <Tab key={half + i} it={it} />
        ))}
      </div>
    </nav>
  );
}
