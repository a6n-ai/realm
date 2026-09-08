"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, LogInIcon, PlusIcon, TagIcon, UtensilsCrossedIcon, type LucideIcon } from "lucide-react";

// Public-site nav dock — brutalist skin (border-[1.5px] border-foreground,
// rounded-2xl, glow FAB) matching hero.tsx/checkout.tsx's vocabulary, not
// @foundry/design-system's BottomNav (that component's "glass"/"dock" variants
// are the softer customer-app/CRM looks, and it's hardcoded md:hidden — this
// stays visible at every width while we compare desktop vs mobile).
type DockItem = { title: string; href: string; icon: LucideIcon };

const LEFT: DockItem[] = [
  { title: "Home", href: "/", icon: HomeIcon },
  { title: "Menu", href: "/menu/weekly", icon: UtensilsCrossedIcon },
];
const RIGHT: DockItem[] = [
  { title: "Plans", href: "/plans", icon: TagIcon },
  { title: "Sign in", href: "/login", icon: LogInIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Tab({ item, active }: { item: DockItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold tracking-wide transition-transform duration-150 ease-out active:scale-[0.96] ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <item.icon className="size-5" strokeWidth={active ? 2.4 : 1.75} />
      <span className="max-w-full truncate leading-none">{item.title}</span>
    </Link>
  );
}

export function PublicDock() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 md:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="border-foreground bg-background hover-lift flex w-full max-w-md items-stretch rounded-2xl border-[1.5px] px-1 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.35)]">
        {LEFT.map((item) => (
          <Tab key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
        <div className="relative flex w-[4.5rem] shrink-0 flex-col items-center justify-end pb-1.5">
          <Link
            href="/subscribe"
            aria-label="Start a subscription"
            className="bg-primary text-primary-foreground -mt-6 flex size-14 shrink-0 items-center justify-center rounded-full shadow-[0_12px_30px_-6px_var(--color-primary)] transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            <PlusIcon className="size-6" strokeWidth={2.5} />
          </Link>
          <span className="text-foreground mt-1 max-w-full text-center text-[10px] leading-tight font-semibold">
            Order
          </span>
        </div>
        {RIGHT.map((item) => (
          <Tab key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </div>
    </nav>
  );
}
