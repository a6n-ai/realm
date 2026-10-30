/* eslint-disable */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, Clock, Ellipsis, Gift, LifeBuoy, Plus, RefreshCw, Wallet, User, UtensilsCrossed } from "lucide-react";
import { useTheme } from "@foundry/themes";
import { cutoffNote, cutoffTime, formatCountdown, nextCutoff } from "@/lib/deliveries-view/cutoff";
import { useTimezone } from "@/components/providers/timezone-provider";
import { AnimatedIcon, CoinChip, IconTile, ListRow, MenuSection, NavPill, Segmented, Sheet, type IconTint } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { BrandMark, BrandWordmark } from "@/components/brand-logo";
import { useSupportUnread } from "@/components/customer/support/unread";
import { PageTransition } from "@/components/motion/page-transition";

const ACCOUNT_PATHS = ["/me/account"];
const MENU_PATHS = ["/me/menu", "/me/renew"];
const SUPPORT_PATHS = ["/me/support"];
const REFER_PATHS = ["/me/refer"];
const under = (p: string, base: string) => p === base || p.startsWith(`${base}/`);
// Order-flow pages (renew and new order) draw their own top bar (SubscribeChrome) and bottom action bar,
// so the app's logo bar, cutoff, wallet and tab bar step aside: one bar on top, same as checkout.
const FLOW_PATHS = ["/me/renew"];

type Tab = "deliveries" | "menu" | "refer" | "support" | "account";

function activeTab(p: string): Tab | null {
  // Finances belongs to the header CoinChip, not to a nav item.
  if (under(p, "/me/wallet")) return null;
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

// Each tab is its own pill inside the floating bar; the current one is lit like an iOS tab bar.
const TAB_ORDER = ["deliveries", "support", "refer", "account", "menu"] as const;
const tabCls = (on: boolean, compact = false) =>
  cn(
    "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold transition-[height,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] [-webkit-tap-highlight-color:transparent] motion-reduce:transition-none",
    compact ? "h-10" : "h-14",
    // The lit pill itself is one shared highlight that slides between tabs (see TAB_ORDER).
    "relative z-[1]",
    on ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]",
  );

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
/** The account's photo, or its initials, as a round glass button to Account — the iOS profile corner. */
function AccountAvatar({ name, image, active }: { name: string | null; image: string | null; active: boolean }) {
  const initials = (name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return (
    <Link
      href="/me/account"
      aria-label="Account"
      aria-current={active ? "page" : undefined}
      className={cn(FOCUS, "c-liquid grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-transparent text-[15px] font-semibold transition-transform active:scale-[.96] motion-reduce:transform-none", active && "ring-[1.5px] ring-[var(--primary)]")}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </Link>
  );
}

function CutoffChip({ cutoffHour }: { cutoffHour: number }) {
  const tz = useTimezone();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 30_000);
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
          "inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-left sm:gap-2 [touch-action:manipulation] transition-[background-color,border-color,transform] duration-150 active:scale-[.97] motion-reduce:transform-none [@media(hover:hover)]:hover:-translate-y-px",
          urgent ? "border-transparent bg-[var(--primary-wash,#FBE3D2)]" : "c-liquid border-transparent",
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
            {next ? formatCountdown(next.ms) : "--"}
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

export function CustomerShell({ coinBalance, coinValue = null, cutoffHour, userPublicId, userName = null, userImage = null, staffReplies = {}, children }: { coinBalance: number; coinValue?: number | null; cutoffHour: number; userPublicId: string; userName?: string | null; userImage?: string | null; staffReplies?: Record<string, number>; children: ReactNode }) {
  const unread = useSupportUnread(staffReplies);
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const tab = activeTab(pathname);
  // The tapped tab lights at once; the route catches up behind it, so switching never waits on the page.
  const [tapped, setTapped] = useState<string | null>(null);
  useEffect(() => setTapped(null), [pathname]);
  const lit = tapped ?? tab;
  const litAt = TAB_ORDER.indexOf(lit as (typeof TAB_ORDER)[number]);
  // iOS 26 tab bar: the lit pill stretches across to the tapped tab, then gathers onto it, like a drop of liquid.
  const pill = useRef<HTMLSpanElement>(null);
  const lastAt = useRef(litAt);
  useLayoutEffect(() => {
    const el = pill.current;
    const from = lastAt.current;
    lastAt.current = litAt;
    if (!el || from < 0 || litAt < 0 || from === litAt || !el.animate) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const at = (i: number, stretch = 1) => `translateX(${i * 100}%) scaleX(${stretch})`;
    el.animate(
      [
        { transform: at(from) },
        { transform: at(Math.min(from, litAt), Math.abs(litAt - from) + 1), offset: 0.45 },
        { transform: at(litAt) },
      ],
      { duration: 420, easing: "cubic-bezier(0.34,1.3,0.64,1)" },
    );
  }, [litAt]);
  // Like iOS 26 (tabBarMinimizeBehavior .onScrollDown): scrolling down shrinks the bar to icons, scrolling up
  // brings the labels back. Pages read --tabbar-h to keep their floating bars just above it.
  const [compact, setCompact] = useState(false);
  // iOS navigation bar: see-through at the top of the page, glass with a hairline once content scrolls under it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 4);
      if (y > last + 8 && y > 120) setCompact(true);
      else if (y < last - 8 || y < 120) setCompact(false);
      if (Math.abs(y - last) > 8) last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setCompact(false), [pathname]);
  useEffect(() => {
    document.documentElement.style.setProperty("--tabbar-h", compact ? "3rem" : "4rem");
    return () => { document.documentElement.style.removeProperty("--tabbar-h"); };
  }, [compact]);
  const label = cn("transition-opacity duration-200", compact && "sr-only");
  const flow = FLOW_PATHS.some((b) => under(pathname, b));

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
      {!flow && <header
        className={cn("sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] transition-[background-color,border-color] duration-200", scrolled ? "c-glass border-[var(--border)]" : "border-transparent bg-transparent")}
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
            <AccountAvatar name={userName} image={userImage} active={tab === "account"} />
          </div>
        </div>
      </header>}

      <main id="main" tabIndex={-1} className={cn("mx-auto outline-none w-full max-w-[1280px] px-4 lg:px-6", flow ? "pb-0 pt-0" : "pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 lg:pb-10 lg:pt-6")}><PageTransition>{children}</PageTransition></main>

      {!flow && <nav
        aria-label="Primary"
        // Floats off the edges as a glass pill (iOS tab bar); content scrolls visibly beneath it.
        className="c-liquid fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-full border p-1 lg:hidden"
        style={{ viewTransitionName: "customer-bottom-nav" }}
      >
        <div className="relative mx-auto flex max-w-md items-stretch">
          <span
            ref={pill}
            aria-hidden
            className={cn("absolute inset-y-0 left-0 w-1/5 origin-left rounded-full bg-[color-mix(in_oklab,var(--primary)_16%,transparent)]", litAt < 0 && "opacity-0")}
            style={{ transform: `translateX(${Math.max(litAt, 0) * 100}%)` }}
          />
          <Link href="/me" onClick={() => setTapped("deliveries")} aria-current={tab === "deliveries" ? "page" : undefined} className={cn(FOCUS, tabCls(lit === "deliveries", compact))}>
            <AnimatedIcon active={lit === "deliveries"} gesture="pop"><CalendarDays aria-hidden className="size-6" /></AnimatedIcon><span className={label}>Deliveries</span>
          </Link>
          <Link href="/me/support" onClick={() => setTapped("support")} aria-current={tab === "support" ? "page" : undefined} className={cn(FOCUS, tabCls(lit === "support", compact))}>
            <span className="relative">
              <AnimatedIcon active={lit === "support"} gesture="spin"><LifeBuoy aria-hidden className="size-6" /></AnimatedIcon>
              <UnreadBadge count={unread} className="absolute -right-2.5 -top-1.5" />
            </span>
            <span className={label}>Support</span>
          </Link>
          <Link href="/me/refer" onClick={() => setTapped("refer")} aria-current={tab === "refer" ? "page" : undefined} className={cn(FOCUS, tabCls(lit === "refer", compact))}>
            <AnimatedIcon active={lit === "refer"} gesture="wiggle"><Gift aria-hidden className="size-6" /></AnimatedIcon><span className={label}>Refer</span>
          </Link>
          <Link href="/me/account" onClick={() => setTapped("account")} aria-current={tab === "account" ? "page" : undefined} className={cn(FOCUS, tabCls(lit === "account", compact))}>
            <AnimatedIcon active={lit === "account"} gesture="pop"><User aria-hidden className="size-6" /></AnimatedIcon><span className={label}>Account</span>
          </Link>
          <MenuButton active={tab === "menu"} onClick={() => setOpen(true)} className={tabCls(lit === "menu", compact)}>
            <AnimatedIcon active={lit === "menu" || open} gesture="bounce"><Ellipsis aria-hidden className="size-6" /></AnimatedIcon><span className={label}>More</span>
          </MenuButton>
        </div>
      </nav>}

      {/* This week's menu one tap away from anywhere: a tinted glass button over the content, right-hand side.
          On Deliveries it rides above that page's own floating action bar. */}
      {!flow && tab !== "menu" && (
        <Link
          href="/me/menu"
          aria-label="This week's menu"
          className={cn(
            FOCUS,
            "c-liquid-tint fixed right-4 z-30 inline-flex size-14 items-center justify-center gap-2 rounded-full text-[var(--primary-foreground,#fff)] transition-transform duration-150 active:scale-[.94] motion-reduce:transform-none lg:bottom-6 lg:right-6 lg:size-auto lg:h-12 lg:px-5 [@media(hover:hover)]:hover:-translate-y-px",
            pathname === "/me"
              ? "bottom-[calc(var(--tabbar-h,4rem)+max(0.75rem,env(safe-area-inset-bottom))+4.25rem)]"
              : "bottom-[calc(var(--tabbar-h,4rem)+max(0.75rem,env(safe-area-inset-bottom))+0.75rem)]",
          )}
        >
          <UtensilsCrossed aria-hidden className="size-6 lg:size-5" />
          <span aria-hidden className="hidden text-[15px] font-semibold lg:inline">This week&apos;s menu</span>
        </Link>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="More">
        {/* Ordered by how often people reach for them: this week's food first, ordering last. */}
        <MenuSection title="Meals">
          {/* Renew sits in the middle and is the one lit up: it is what most customers open this for. */}
          <div className="grid grid-cols-3 gap-2">
            <MenuTile href="/me/menu" tint="orange" icon={<UtensilsCrossed />} label="Weekly menu" sublabel="This week" />
            <MenuTile href="/me/renew" tint="green" icon={<RefreshCw />} label="Renew" sublabel="Same plan" primary />
            <MenuTile href="/me/renew?full=1" tint="blue" icon={<Plus />} label="New order" sublabel="Another plan" />
          </div>
        </MenuSection>
        <MenuSection title="Money">
          <ListRow href="/me/wallet" tint="indigo" icon={<Wallet />} label="Finances" sublabel="Coins, coupons, bills" />
        </MenuSection>
        <MenuSection title="Appearance">
          <Segmented label="Theme" idPrefix="menu-theme" items={THEMES} value={theme ?? "system"} onChange={(t) => setTheme(t as "light" | "dark" | "system")} className="[&>button]:flex-1" />
        </MenuSection>
      </Sheet>
    </div>
  );
}

function MenuTile({ href, icon, tint, label, sublabel, primary = false }: { href: string; icon: ReactNode; tint: IconTint; label: string; sublabel: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        FONT, FOCUS,
        "c-surface flex min-h-[104px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-center transition-colors active:bg-[var(--muted)]",
        primary
          ? "bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))]"
          : "bg-[var(--card)] hover:bg-[var(--muted)]",
      )}
    >
      <IconTile tint={tint} size="lg">{icon}</IconTile>
      <span className="text-[15px] leading-tight font-semibold">{label}</span>
      <span className="text-[13px] leading-tight text-[var(--muted-foreground)]">{sublabel}</span>
    </Link>
  );
}
