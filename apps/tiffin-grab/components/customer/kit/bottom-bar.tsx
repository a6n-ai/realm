import Link from "next/link";
import type { ReactNode } from "react";
import { cn, FONT, FOCUS } from "./cn";

/** Sticky glass CTA bar: hairline top, safe-area padding, one primary action. */
export function BottomBar({ children, note, className, alignEnd }: { children: ReactNode; note?: string; className?: string; /** From sm up, right-align the note and the actions (wizard bar). */ alignEnd?: boolean }) {
  return (
    <div className={cn(FONT, "c-glass fixed inset-x-0 bottom-0 z-[45] border-t border-[var(--border)] px-4 pt-3", className)} style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      {note && <p role="status" className={cn("c-caption mx-auto mb-2 max-w-3xl text-center", alignEnd && "sm:text-right")}>{note}</p>}
      <div className={cn("mx-auto flex max-w-3xl gap-2", alignEnd && "sm:justify-end")}>{children}</div>
    </div>
  );
}

export interface TabBarItem {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
}

/** Mobile bottom nav: labelled tabs, 56px tall, saffron for current. */
export function TabBar({ items, label = "Primary" }: { items: TabBarItem[]; label?: string }) {
  return (
    <nav aria-label={label} className={cn(FONT, "c-glass fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] pb-[env(safe-area-inset-bottom)]")}>
      <ul className="mx-auto flex max-w-3xl">
        {items.map((it) => (
          <li key={it.href} className="flex-1">
            <Link
              href={it.href}
              aria-current={it.active ? "page" : undefined}
              className={cn(FOCUS, "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", it.active ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]")}
            >
              <span aria-hidden>{it.icon}</span>
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
