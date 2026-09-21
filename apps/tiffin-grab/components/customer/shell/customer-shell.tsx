"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, LifeBuoy, LogOut, Menu as MenuIcon, Plus, RefreshCw, User, UtensilsCrossed } from "lucide-react";
import { useTheme } from "@foundry/themes";
import { signOut } from "@/lib/auth/client";
import { CUSTOMER_ACCOUNT_NAV } from "@/app/(customer)/me/(account-settings)/nav.config";
import { CoinChip, ListRow, MenuSection, NavPill, Segmented, Sheet, ThemeToggle } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";

const ACCOUNT_PATHS = ["/me/account", "/me/usage", ...CUSTOMER_ACCOUNT_NAV.map((i) => i.href)];
const MENU_PATHS = ["/me/menu", "/me/renew", "/me/support"];
const under = (p: string, base: string) => p === base || p.startsWith(`${base}/`);

type Tab = "deliveries" | "menu" | "account";

function activeTab(p: string): Tab | null {
  if (MENU_PATHS.some((b) => under(p, b))) return "menu";
  if (ACCOUNT_PATHS.some((b) => under(p, b))) return "account";
  if (p === "/me" || under(p, "/me") || under(p, "/me/meals")) return "deliveries";
  return null;
}

const THEMES = [
  { id: "light", label: "Light" },
  { id: "system", label: "Auto" },
  { id: "dark", label: "Dark" },
];

function Brand() {
  return (
    <Link href="/me" aria-label="TiffinGrab home" className={cn(FONT, FOCUS, "flex min-h-11 items-center gap-2 rounded-full")}>
      <span aria-hidden className="grid size-9 place-items-center rounded-full bg-[var(--primary)] text-white">
        <UtensilsCrossed className="size-[18px]" />
      </span>
      <span className="c-title">
        Tiffin<em className="text-[var(--primary)]">Grab</em>
      </span>
    </Link>
  );
}

function MenuButton({ active, onClick, className, children }: { active: boolean; onClick: () => void; className: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" data-active={active || undefined} className={cn(FONT, FOCUS, "[touch-action:manipulation]", className)}>
      {children}
    </button>
  );
}

const tabCls = (on: boolean) =>
  cn("flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", on ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]");

export function CustomerShell({ coinBalance, children }: { coinBalance: number; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const tab = activeTab(pathname);

  useEffect(() => setOpen(false), [pathname]);

  const menuPill = cn(
    "inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors",
    tab === "menu" ? "bg-[var(--primary-wash,#FBE3D2)] text-[#B5430B] dark:text-[#FFB877]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
  );

  return (
    <div className={cn(FONT, "min-h-dvh bg-[var(--background)] text-[var(--foreground)]")}>
      <header className="c-glass sticky top-0 z-40 border-b border-[var(--border)] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto grid h-16 max-w-[1280px] grid-cols-[1fr_auto] items-center gap-3 px-4 lg:grid-cols-[1fr_auto_1fr] lg:px-6">
          <Brand />
          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            <NavPill href="/me" active={tab === "deliveries"}>Deliveries</NavPill>
            <MenuButton active={tab === "menu"} onClick={() => setOpen(true)} className={menuPill}>Menu</MenuButton>
            <NavPill href="/me/account" active={tab === "account"}>Account</NavPill>
          </nav>
          <div className="flex items-center justify-end gap-2">
            <CoinChip href="/me/wallet" balance={coinBalance} active={under(pathname, "/me/wallet")} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 lg:px-6 lg:pb-10 lg:pt-6">{children}</main>

      <nav aria-label="Primary" className="c-glass fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="relative mx-auto flex max-w-md items-stretch">
          <Link href="/me" aria-current={tab === "deliveries" ? "page" : undefined} className={cn(FOCUS, tabCls(tab === "deliveries"))}>
            <CalendarDays aria-hidden className="size-6" />Deliveries
          </Link>
          <MenuButton active={tab === "menu"} onClick={() => setOpen(true)} className={tabCls(tab === "menu")}>
            <MenuIcon aria-hidden className="size-6" />Menu
          </MenuButton>
          <Link href="/me/account" aria-current={tab === "account" ? "page" : undefined} className={cn(FOCUS, tabCls(tab === "account"))}>
            <User aria-hidden className="size-6" />Account
          </Link>
        </div>
      </nav>

      <Sheet open={open} onClose={() => setOpen(false)} title="Menu">
        <MenuSection title="Meals">
          <ListRow href="/subscribe" icon={<Plus className="size-[18px]" />} label="New order" sublabel="Start another plan" />
          <ListRow href="/me/menu" icon={<UtensilsCrossed className="size-[18px]" />} label="Weekly menu" sublabel="What is being served" />
          <ListRow href="/me/renew" icon={<RefreshCw className="size-[18px]" />} label="Renew plan" sublabel="Keep your meals coming" />
        </MenuSection>
        <MenuSection title="Appearance">
          <Segmented label="Theme" idPrefix="menu-theme" items={THEMES} value={theme ?? "system"} onChange={(t) => setTheme(t as "light" | "dark" | "system")} className="[&>button]:flex-1" />
        </MenuSection>
        <MenuSection title="Help">
          <ListRow href="/me/support" icon={<LifeBuoy className="size-[18px]" />} label="Support" sublabel="Ask us anything" />
        </MenuSection>
        <div className="py-2">
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
            className={cn(FOCUS, "flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-semibold [touch-action:manipulation] active:bg-[var(--muted)]")}
          >
            <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-[var(--muted)]"><LogOut className="size-[18px]" /></span>
            Sign out
          </button>
        </div>
      </Sheet>
    </div>
  );
}
