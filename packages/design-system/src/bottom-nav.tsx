"use client";
import Link from "next/link";
import { PlusIcon, type LucideIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";

export type BottomNavItem = { title: string; icon: LucideIcon; active: boolean } & (
  | { href: string }
  | { onClick: () => void }
);

const GLASS_PILL = cn(
  "relative isolate rounded-[32px]",
  "border border-white/55 bg-background/55",
  "shadow-[0_8px_32px_rgba(15,15,15,0.12),inset_0_1px_0_rgba(255,255,255,0.7)]",
  "backdrop-blur-2xl backdrop-saturate-150",
  "dark:border-white/12 dark:bg-background/40",
  "dark:shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.14)]",
  "[@media(prefers-reduced-transparency:reduce)]:border-border [@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none [@media(prefers-reduced-transparency:reduce)]:shadow-sm",
);

// Mobile-only fixed bottom tab bar with an optional raised center FAB. Presentational
// only — the app injects role-filtered items (link or action) + FAB callback. Hidden at md+.
// variant="glass" is the floating Liquid Glass capsule (customer); dock is the edge-to-edge CRM bar.
export function BottomNav({
  items,
  onFabClick,
  fabLabel,
  fabCaption,
  variant = "dock",
}: {
  items: BottomNavItem[];
  onFabClick?: () => void;
  /** Accessible name for the raised center button. */
  fabLabel?: string;
  /** Optional visible caption under the FAB (e.g. "New plan"). */
  fabCaption?: string;
  variant?: "dock" | "glass";
}) {
  const glass = variant === "glass";
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);
  const tabClass = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-1 tracking-wide",
      "transition-[transform,color,background-color] duration-150 ease-out",
      "active:scale-[0.96]",
      glass
        ? cn(
            "relative z-10 mx-0.5 my-1.5 min-h-16 rounded-[22px] px-1 text-xs",
            active ? "bg-primary/12 font-semibold text-primary" : "font-medium text-muted-foreground",
          )
        : cn("min-h-14 text-[10px] font-medium", active ? "text-foreground" : "text-muted-foreground"),
    );
  const Tab = ({ it }: { it: BottomNavItem }) => {
    const body = (
      <>
        <span
          className={cn(
            "flex items-center justify-center rounded-full",
            glass ? "size-10" : "size-8",
            glass && it.active && "bg-primary/18",
          )}
        >
          <it.icon className={glass ? "size-6" : "size-5"} strokeWidth={it.active ? 2.4 : 1.75} />
        </span>
        <span className="max-w-full truncate leading-none">{it.title}</span>
      </>
    );
    return "href" in it ? (
      <Link href={it.href} aria-current={it.active ? "page" : undefined} className={tabClass(it.active)}>
        {body}
      </Link>
    ) : (
      <button
        type="button"
        onClick={it.onClick}
        aria-current={it.active ? "page" : undefined}
        className={tabClass(it.active)}
      >
        {body}
      </button>
    );
  };

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 md:hidden",
        glass
          ? "pointer-events-none px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          : "border-t bg-background/95 backdrop-blur",
      )}
      style={glass ? undefined : { paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div
        className={cn(
          "flex items-stretch",
          glass && cn("pointer-events-auto", GLASS_PILL),
        )}
      >
        {glass ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[32px]"
          >
            <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/45 to-transparent dark:from-white/10" />
          </span>
        ) : null}
        {left.map((it, i) => (
          <Tab key={i} it={it} />
        ))}
        {onFabClick && (
          <div
            className={cn(
              "relative z-10 flex shrink-0 flex-col items-center",
              glass ? "min-w-[4.5rem] justify-center px-1 py-1.5" : "w-[4.5rem] justify-end pb-1",
            )}
          >
            <button
              type="button"
              onClick={onFabClick}
              aria-label={fabLabel ?? "Create"}
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full",
                "bg-primary text-primary-foreground",
                "transition-transform duration-150 ease-out active:scale-[0.96]",
                glass
                  ? "size-12 shadow-[0_8px_20px_color-mix(in_oklab,var(--primary)_45%,transparent)]"
                  : "-mt-6 size-14 shadow-lg",
              )}
            >
              <PlusIcon className={glass ? "size-6" : "size-6"} strokeWidth={2.5} />
            </button>
            {fabCaption ? (
              <span
                className={cn(
                  "text-foreground mt-1 max-w-full text-center font-semibold leading-tight",
                  glass ? "text-[10px]" : "text-muted-foreground text-[10px] font-medium",
                )}
              >
                {fabCaption}
              </span>
            ) : null}
          </div>
        )}
        {right.map((it, i) => (
          <Tab key={half + i} it={it} />
        ))}
      </div>
    </nav>
  );
}
