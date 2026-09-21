"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  CalendarDaysIcon,
  ChevronRightIcon,
  CoinsIcon,
  LifeBuoyIcon,
  LogOutIcon,
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  RefreshCwIcon,
  SunIcon,
  UserIcon,
  UtensilsCrossedIcon,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "@foundry/themes";
import { signOut } from "@/lib/auth/client";
import { CUSTOMER_ACCOUNT_NAV } from "@/app/(customer)/me/(account-settings)/nav.config";
import { Sheet } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";

const ACCOUNT_PATHS = new Set(["/me/account", "/me/wallet", "/me/usage", ...CUSTOMER_ACCOUNT_NAV.map((i) => i.href)]);
const MENU_PATHS = ["/me/menu", "/me/renew", "/me/support"];

const under = (p: string, base: string) => p === base || p.startsWith(`${base}/`);

type Tab = "deliveries" | "menu" | "account";

function activeTab(pathname: string): Tab | null {
  if (MENU_PATHS.some((b) => under(pathname, b))) return "menu";
  if (ACCOUNT_PATHS.has(pathname) || under(pathname, "/me/account")) return "account";
  if (pathname === "/me" || under(pathname, "/me/deliveries") || under(pathname, "/me/meals")) return "deliveries";
  return null;
}

const CYCLE = { light: "dark", dark: "system", system: "light" } as const;
const THEME_ICON: Record<"light" | "dark" | "system", LucideIcon> = { light: SunIcon, dark: MoonIcon, system: MonitorIcon };

function ThemeButton({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const key = (theme === "light" || theme === "dark" ? theme : "system") as "light" | "dark" | "system";
  const Icon = THEME_ICON[key];
  return (
    <button
      type="button"
      onClick={() => setTheme(CYCLE[key])}
      aria-label={`Theme: ${key}. Switch theme`}
      className={cn(FOCUS, "grid size-11 place-items-center rounded-full text-[var(--foreground)] [touch-action:manipulation] hover:bg-[var(--muted)]", className)}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}

function CoinChip({ balance }: { balance: number }) {
  return (
    <Link
      href="/me/wallet"
      aria-label={`Wallet, ${balance} coins`}
      className={cn(FOCUS, "inline-flex h-11 items-center gap-1.5 rounded-full bg-[var(--primary-wash,#FBE3D2)] px-3.5 text-[15px] font-semibold tabular-nums text-[#B5430B] [touch-action:manipulation] dark:text-[#FFB877]")}
    >
      <CoinsIcon aria-hidden className="size-4" />
      {balance}
    </Link>
  );
}

function Brand() {
  return (
    <Link href="/me" aria-label="TiffinGrab home" className={cn(FOCUS, "flex min-h-11 items-center gap-2.5 rounded-full")}>
      <span className="grid size-9 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground,#fff)]">
        <UtensilsCrossedIcon aria-hidden className="size-[18px]" />
      </span>
      <span className="text-[19px] font-bold tracking-[-0.03em]">
        Tiffin<em className="font-semibold text-[var(--primary)]">Grab</em>
      </span>
    </Link>
  );
}

function NavPill({ active, icon: Icon, label, ...rest }: { active: boolean; icon: LucideIcon; label: string } & ({ href: string; onClick?: never } | { href?: never; onClick: () => void })) {
  const cls = cn(
    FOCUS,
    "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold [touch-action:manipulation] transition-colors",
    active ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted-foreground,#6E6558)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
  );
  const body = (<><Icon aria-hidden className="size-[18px]" />{label}</>);
  return rest.href ? (
    <Link href={rest.href} aria-current={active ? "page" : undefined} className={cls}>{body}</Link>
  ) : (
    <button type="button" onClick={rest.onClick} aria-haspopup="dialog" className={cls}>{body}</button>
  );
}

function TabButton({ active, icon: Icon, label, ...rest }: { active: boolean; icon: LucideIcon; label: string } & ({ href: string; onClick?: never } | { href?: never; onClick: () => void })) {
  const cls = cn(
    FOCUS,
    "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold [touch-action:manipulation]",
    active ? "text-[var(--primary)]" : "text-[var(--muted-foreground,#6E6558)]",
  );
  const body = (<><Icon aria-hidden className="size-6" />{label}</>);
  return rest.href ? (
    <Link href={rest.href} aria-current={active ? "page" : undefined} className={cls}>{body}</Link>
  ) : (
    <button type="button" onClick={rest.onClick} aria-haspopup="dialog" className={cls}>{body}</button>
  );
}

function MenuRow({ href, icon: Icon, label, hint, onNavigate }: { href: string; icon: LucideIcon; label: string; hint: string; onNavigate: () => void }) {
  return (
    <Link href={href} onClick={onNavigate} className={cn(FOCUS, "flex min-h-14 items-center gap-3 rounded-2xl px-3 [touch-action:manipulation] hover:bg-[var(--muted)]")}>
      <span className="grid size-10 place-items-center rounded-full bg-[var(--muted)]"><Icon aria-hidden className="size-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold tracking-[-0.01em]">{label}</span>
        <span className="block text-sm text-[var(--muted-foreground,#6E6558)]">{hint}</span>
      </span>
      <ChevronRightIcon aria-hidden className="size-5 text-[var(--muted-foreground,#6E6558)]" />
    </Link>
  );
}

export function CustomerShell({ coinBalance, children }: { coinBalance: number; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const tab = activeTab(pathname);
  const { theme, setTheme } = useTheme();
  const close = () => setMenuOpen(false);

  return (
    <div className={cn(FONT, "min-h-dvh bg-[var(--background)] text-[var(--foreground)]")}>
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto grid h-16 w-full max-w-[1280px] grid-cols-[1fr_auto] items-center gap-3 px-4 lg:grid-cols-[1fr_auto_1fr] lg:px-6">
          <Brand />
          <nav aria-label="Primary" className="hidden items-center gap-1 rounded-full bg-[var(--muted)] p-1 lg:flex">
            <NavPill href="/me" active={tab === "deliveries"} icon={CalendarDaysIcon} label="Deliveries" />
            <NavPill onClick={() => setMenuOpen(true)} active={tab === "menu"} icon={MenuIcon} label="Menu" />
            <NavPill href="/me/account" active={tab === "account"} icon={UserIcon} label="Account" />
          </nav>
          <div className="flex items-center justify-end gap-1">
            <CoinChip balance={coinBalance} />
            <ThemeButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-[calc(112px+env(safe-area-inset-bottom))] pt-4 lg:px-6 lg:pb-10 lg:pt-6">{children}</main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--background)]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className="relative mx-auto flex h-[60px] max-w-md items-stretch px-2">
          <TabButton href="/me" active={tab === "deliveries"} icon={CalendarDaysIcon} label="Deliveries" />
          <span aria-hidden className="w-20 shrink-0" />
          <TabButton onClick={() => setMenuOpen(true)} active={tab === "menu"} icon={MenuIcon} label="Menu" />
          <TabButton href="/me/account" active={tab === "account"} icon={UserIcon} label="Account" />
          <Link
            href="/subscribe"
            aria-label="Order a new plan"
            className={cn(FOCUS, "absolute left-1/2 top-0 grid size-14 -translate-x-1/2 -translate-y-1/3 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground,#fff)] shadow-[0_8px_24px_rgba(240,107,26,.4)] [touch-action:manipulation]")}
          >
            <PlusIcon aria-hidden className="size-7" />
          </Link>
        </div>
      </nav>

      <Sheet open={menuOpen} onClose={close} title="Menu">
        <div className="flex flex-col gap-1 pb-2">
          <MenuRow href="/me/menu" icon={UtensilsCrossedIcon} label="Weekly menu" hint="What is being served this week" onNavigate={close} />
          <MenuRow href="/me/renew" icon={RefreshCwIcon} label="Renew plan" hint="Keep your meals coming" onNavigate={close} />
          <div className="my-2 flex items-center justify-between gap-3 rounded-2xl bg-[var(--muted)] p-1" role="group" aria-label="Theme">
            {(["light", "system", "dark"] as const).map((t) => {
              const Icon = THEME_ICON[t];
              return (
                <button key={t} type="button" onClick={() => setTheme(t)} aria-pressed={theme === t} className={cn(FOCUS, "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold capitalize [touch-action:manipulation]", theme === t && "bg-[var(--card)] shadow-sm")}>
                  <Icon aria-hidden className="size-4" />{t}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={async () => { await signOut(); router.push("/login"); }}
            className={cn(FOCUS, "flex min-h-14 items-center gap-3 rounded-2xl px-3 text-left text-[17px] font-semibold [touch-action:manipulation] hover:bg-[var(--muted)]")}
          >
            <span className="grid size-10 place-items-center rounded-full bg-[var(--muted)]"><LogOutIcon aria-hidden className="size-5" /></span>
            Sign out
          </button>
          <MenuRow href="/me/support" icon={LifeBuoyIcon} label="Support" hint="Ask us anything" onNavigate={close} />
        </div>
      </Sheet>
    </div>
  );
}
