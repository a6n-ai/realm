/* eslint-disable */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, Clock, Ellipsis, Gift, LifeBuoy, Plus, RefreshCw, User, UtensilsCrossed } from "lucide-react";
import { useTheme } from "@foundry/themes";
import { cutoffNote, cutoffTime, formatCountdown, nextCutoff } from "@/lib/deliveries-view/cutoff";
import { useTimezone } from "@/components/providers/timezone-provider";
import { CoinChip, ListRow, MenuSection, NavPill, Segmented, Sheet } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";
import { useSupportUnread } from "@/components/customer/support/unread";
import { PageTransition } from "@/components/motion/page-transition";

const ACCOUNT_PATHS = ["/me/account"];
const MENU_PATHS = ["/me/menu", "/me/renew"];
const SUPPORT_PATHS = ["/me/support"];
const REFER_PATHS = ["/me/refer"];
const under = (p: string, base: string) => p === base || p.startsWith(`${base}/`);

type Tab = "deliveries" | "menu" | "refer" | "support" | "account";

function activeTab(p: string): Tab | null {
  if (MENU_PATHS.some((b) => under(p, b))) return "menu";
  if (REFER_PATHS.some((b) => under(p, b))) return "refer";
  if (SUPPORT_PATHS.some((b) => under(p, b))) return "support";
  if (ACCOUNT_PATHS.some((b) => under(p, b))) return "account";
  if (p === "/me" || under(p, "/me")) return "deliveries";
  return null;
}

const THEMES = [
  { id: "light", label: "Light" },
  { id: "system", label: "Auto" },
  { id: "dark", label: "Dark" },
];

/** Mark + wordmark. `compact` fits a 44px chrome bar (public subscribe and checkout). */
export function Brand({ href = "/me", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} aria-label="TiffinGrab home" className={cn(FONT, FOCUS, "flex min-h-11 w-fit items-center gap-2 justify-self-start rounded-full")}>
      <BrandMark className={compact ? "size-8" : "size-9"} />
      <BrandWordmark className={compact ? "text-[20px]" : "text-[22px]"} />
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

/** Count of tickets with an unseen staff reply; a dot-sized pill beside the Support label. */
function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span className={cn("grid min-w-[18px] place-items-center rounded-full bg-[var(--primary)] px-1 text-[11px] font-bold leading-[18px] text-[var(--primary-foreground,#fff)] tabular-nums", className)}>
      {count}
      <span className="sr-only">{count === 1 ? " new reply" : " new replies"}</span>
    </span>
  );
}

/** Live countdown to the next cutoff in the app timezone; tap for what it means. Server render and
 * the first client frame show a dashed placeholder, so hydration never sees a clock. */
function CutoffChip({ cutoffHour }: { cutoffHour: number }) {
  const tz = useTimezone();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const next = now === null ? null : nextCutoff(now, cutoffHour, tz);
  const urgent = next !== null && next.ms < 2 * 3600_000;
  const chip = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  // Pin the popover under the chip each time it opens; the top layer has no anchor otherwise.
  const place = (e: { newState: string }) => {
    const r = chip.current?.getBoundingClientRect();
    if (e.newState !== "open" || !r || !pop.current) return;
    // Right-align to the chip, but never past the 16px gutter on either side (phones are narrower than chip + popover).
    const width = Math.min(272, innerWidth - 32);
    const right = Math.max(16, Math.min(innerWidth - r.right, innerWidth - width - 16));
    pop.current.style.top = `${r.bottom + 10}px`;
    pop.current.style.right = `${right}px`;
    pop.current.style.setProperty("--caret", `${innerWidth - (r.left + r.width / 2) - right - 6}px`);
  };
  return (
    <>
      <button
        ref={chip}
        type="button"
        popoverTarget="cutoff-info"
        data-testid="cutoff-chip"
        aria-label={next ? `Cutoff in ${formatCountdown(next.ms)}. ${cutoffNote(cutoffHour)}` : cutoffNote(cutoffHour)}
        data-urgent={urgent || undefined}
        className={cn(
          FOCUS,
          "inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-left sm:gap-2 [touch-action:manipulation] transition-[background-color,border-color,transform] duration-150 hover:border-[var(--primary)] active:scale-[.97] motion-reduce:transform-none [@media(hover:hover)]:hover:-translate-y-px",
          urgent ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)]" : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]",
        )}
      >
        {urgent ? (
          <span aria-hidden className="relative grid size-4 shrink-0 place-items-center">
            <span className="absolute size-2.5 animate-ping rounded-full bg-[var(--primary)] opacity-60 motion-reduce:hidden" />
            <span className="size-2 rounded-full bg-[var(--primary)]" />
          </span>
        ) : (
          <Clock aria-hidden className="size-4 shrink-0 text-[var(--primary)]" />
        )}
        <span className="flex flex-col leading-none">
          <span className="hidden text-[11px] font-semibold text-[var(--muted-foreground)] sm:block">Cutoff in</span>
          <span className={cn("text-[13px] sm:mt-0.5 font-bold tabular-nums", urgent && "text-[#B5430B] dark:text-[#FFB877]")}>
            {next ? formatCountdown(next.ms) : "--:--:--"}
          </span>
        </span>
      </button>
      <div
        ref={pop}
        id="cutoff-info"
        popover="auto"
        onBeforeToggle={place}
        className={cn(FONT, "fixed inset-auto m-0 w-[min(17rem,calc(100vw-2rem))] overflow-visible rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--foreground)] shadow-lg transition-[opacity,translate] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none")}
      >
        <span aria-hidden className="absolute -top-1.5 right-[var(--caret,24px)] size-3 rotate-45 border-l border-t border-[var(--border)] bg-[var(--card)]" />
        <p className="text-[15px] font-semibold">Next cutoff {cutoffTime(cutoffHour)} {next && !next.today ? "tomorrow" : "today"}</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Pick meals, swap, hold or move a delivery until {cutoffTime(cutoffHour)} the day before. After that, the day is locked.
        </p>
      </div>
    </>
  );
}

export function CustomerShell({ coinBalance, coinValue = null, cutoffHour, userPublicId, staffReplies = {}, children }: { coinBalance: number; coinValue?: number | null; cutoffHour: number; userPublicId: string; staffReplies?: Record<string, number>; children: ReactNode }) {
  const unread = useSupportUnread(staffReplies);
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const tab = activeTab(pathname);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const source = new EventSource(`/api/realtime?channel=${encodeURIComponent(`refresh:${userPublicId}`)}`);
    source.onmessage = (e) => {
      // Only a "message" frame means data changed; the presence frame sent on
      // connect used to re-render the whole page right after every load.
      try {
        if ((JSON.parse(e.data) as { type?: string }).type === "message") router.refresh();
      } catch {
        /* malformed frame: ignore */
      }
    };
    return () => source.close();
  }, [userPublicId, router]);

  const morePill = cn(
    "relative inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold transition-[background-color,color,transform] duration-150 active:scale-[.97] [@media(hover:hover)]:hover:-translate-y-px motion-reduce:transform-none",
    tab === "menu"
      ? "bg-[var(--primary-wash,#FBE3D2)] text-[#B5430B] after:absolute after:bottom-1.5 after:left-1/2 after:h-0.5 after:w-4 after:-translate-x-1/2 after:rounded-full after:bg-current dark:text-[#FFB877]"
      : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
  );

  return (
    <div className={cn(FONT, "min-h-dvh bg-[var(--background)] text-[var(--foreground)]")}>
      <a href="#main" className={cn(FOCUS, "sr-only z-50 rounded-full border border-[var(--primary)] bg-[var(--card)] px-4 py-3 text-sm font-semibold shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-[calc(env(safe-area-inset-top)+4.5rem)]")}>Skip to content</a>
      <header
        className="c-glass sticky top-0 z-40 border-b border-[var(--border)] pt-[env(safe-area-inset-top)]"
        style={{ viewTransitionName: "customer-header" }}
      >
        <div className="mx-auto grid h-16 max-w-[1280px] grid-cols-[1fr_auto] items-center gap-3 px-4 lg:grid-cols-[1fr_auto_1fr] lg:px-6">
          <Brand />
          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            <NavPill href="/me" active={tab === "deliveries"}>Deliveries</NavPill>
            <NavPill href="/me/support" active={tab === "support"}><span className="inline-flex items-center gap-1.5">Support<UnreadBadge count={unread} /></span></NavPill>
            <NavPill href="/me/refer" active={tab === "refer"}>Refer</NavPill>
            <NavPill href="/me/account" active={tab === "account"}>Account</NavPill>
            <MenuButton active={tab === "menu"} onClick={() => setOpen(true)} className={morePill}>
              More<ChevronDown aria-hidden className="ml-1 size-4" />
            </MenuButton>
          </nav>
          <div className="flex items-center justify-end gap-2">
            <CutoffChip cutoffHour={cutoffHour} />
            <CoinChip href="/me/wallet" balance={coinBalance} value={coinValue} active={under(pathname, "/me/wallet")} />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto outline-none w-full max-w-[1280px] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 lg:px-6 lg:pb-10 lg:pt-6"><PageTransition>{children}</PageTransition></main>

      <nav
        aria-label="Primary"
        className="c-glass fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ viewTransitionName: "customer-bottom-nav" }}
      >
        <div className="relative mx-auto flex max-w-md items-stretch">
          <Link href="/me" aria-current={tab === "deliveries" ? "page" : undefined} className={cn(FOCUS, tabCls(tab === "deliveries"))}>
            <CalendarDays aria-hidden className="size-6" />Deliveries
          </Link>
          <Link href="/me/support" aria-current={tab === "support" ? "page" : undefined} className={cn(FOCUS, tabCls(tab === "support"))}>
            <span className="relative">
              <LifeBuoy aria-hidden className="size-6" />
              <UnreadBadge count={unread} className="absolute -right-2.5 -top-1.5" />
            </span>
            Support
          </Link>
          <Link href="/me/refer" aria-current={tab === "refer" ? "page" : undefined} className={cn(FOCUS, tabCls(tab === "refer"))}>
            <Gift aria-hidden className="size-6" />Refer
          </Link>
          <Link href="/me/account" aria-current={tab === "account" ? "page" : undefined} className={cn(FOCUS, tabCls(tab === "account"))}>
            <User aria-hidden className="size-6" />Account
          </Link>
          <MenuButton active={tab === "menu"} onClick={() => setOpen(true)} className={tabCls(tab === "menu")}>
            <Ellipsis aria-hidden className="size-6" />More
          </MenuButton>
        </div>
      </nav>

      <Sheet open={open} onClose={() => setOpen(false)} title="More">
        {/* Ordered by how often people reach for them: this week's food first, ordering last. */}
        <MenuSection title="Meals">
          <ListRow href="/me/menu" icon={<UtensilsCrossed className="size-[18px]" />} label="Weekly menu" sublabel="What is being served" />
          <ListRow href="/me/renew" icon={<RefreshCw className="size-[18px]" />} label="Renew plan" sublabel="Keep your meals coming" />
          <ListRow href="/subscribe" icon={<Plus className="size-[18px]" />} label="New order" sublabel="Start another plan" />
        </MenuSection>
        <MenuSection title="Appearance">
          <Segmented label="Theme" idPrefix="menu-theme" items={THEMES} value={theme ?? "system"} onChange={(t) => setTheme(t as "light" | "dark" | "system")} className="[&>button]:flex-1" />
        </MenuSection>
      </Sheet>
    </div>
  );
}
