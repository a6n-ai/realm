"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Gift, House, TicketPercent, UtensilsCrossed } from "lucide-react";
import { WhatsAppDockLink } from "@/components/landing/whats-app-chat";
import { useSession } from "@/lib/auth/client";
import { roleLanding } from "@/lib/auth/landing";
import { Role, type RoleValue } from "@foundry/commons";
import { pillVisible } from "./pill-visible";
import "./action-pill.css";

// Heroes carry their own call to action, so the bar waits until the hero is mostly scrolled past.
const HERO = ".lp-hero, .tg-refer-stage";
function useHeroInView(path: string | null, mounted: boolean): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!mounted) return;
    const hero = document.querySelector(HERO);
    if (!hero) { setInView(false); return; }
    // "In view" while the hero still reaches below the middle of the screen.
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { rootMargin: "0px 0px -50% 0px" });
    io.observe(hero);
    return () => io.disconnect();
  }, [path, mounted]);
  return inView;
}

export type DockPromo = { text: string; code: string | null; href: string };
type Face = { key: string; href: string; tone: "promo" | "refer" | "order"; icon: typeof Gift; text: string; chip?: string | null; prefetch?: boolean };

const TURN_MS = 3500;
// A manual turn (arrow or swipe) holds the auto-turn this long.
const MANUAL_HOLD_MS = 6000;
const SWIPE_PX = 28;

/** The public site's floating dock, at every width: a Home orb, a slider in the middle and a WhatsApp
 *  orb. The slider moves sideways between the live promotion, the referral bonus and Order now; the
 *  face showing is the button. Arrows and a sideways swipe move it; it pauses under the pointer or
 *  focus and rests on Order now with reduced motion. Renders nothing on the server (no hydration
 *  mismatch) and in the order flow. It replaces the header's Build my tiffin. */
export function ActionPill({ label, refer, promo }: { label: string | null; refer?: string | null; promo?: DockPromo | null }) {
  const path = usePathname();
  const [mounted, setMounted] = useState(false);
  const away = useHeroInView(path, mounted);
  const { data: session } = useSession();
  // `turn` counts moves (any integer); `dir` is the last move's direction; `leaving` is the face sliding out.
  const [slide, setSlide] = useState<{ turn: number; dir: 1 | -1; leaving: number | null }>({ turn: 0, dir: 1, leaving: null });
  const [held, setHeld] = useState(false);
  const manual = useRef(0);
  // Nothing slides in on first paint; every move after that animates, a return to the first face too.
  const moved = useRef(false);
  const swipe = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  useEffect(() => setMounted(true), []);

  const role = (session?.user as { role?: RoleValue } | undefined)?.role;
  // Same rule as the header: signed in goes home (running plan, renewals), else a new order.
  const orderHref = session?.user ? roleLanding(role ?? Role.USER) : "/subscribe";
  const faces: Face[] = [
    ...(promo ? [{ key: "promo", href: promo.href, tone: "promo" as const, icon: TicketPercent, text: promo.text, chip: promo.code, prefetch: false }] : []),
    ...(label ? [{ key: "refer", href: "/refer", tone: "refer" as const, icon: Gift, text: refer ?? label }] : []),
    { key: "order", href: orderHref, tone: "order" as const, icon: UtensilsCrossed, text: "Order now", prefetch: false },
  ];
  const n = faces.length;
  const reduce = mounted && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // With reduced motion it rests on Order now until an arrow or swipe moves it.
  const base = reduce && manual.current === 0 ? n - 1 : 0;
  const at = (t: number) => (((t + base) % n) + n) % n;
  const front = at(slide.turn);
  const move = (d: 1 | -1) => { moved.current = true; setSlide((s0) => ({ turn: s0.turn + d, dir: d, leaving: at(s0.turn) })); };

  useEffect(() => {
    if (!mounted || n < 2 || held || away || reduce) return;
    const t = setInterval(() => { if (!document.hidden && Date.now() - manual.current > MANUAL_HOLD_MS) move(1); }, TURN_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, n, held, away, reduce]);
  // The leaving face is dropped once its slide-out has played.
  useEffect(() => {
    if (slide.leaving == null) return;
    const t = setTimeout(() => setSlide((s0) => ({ ...s0, leaving: null })), 460);
    return () => clearTimeout(t);
  }, [slide.leaving, slide.turn]);

  if (!mounted || !pillVisible(path)) return null;
  const go = (d: 1 | -1) => { manual.current = Date.now(); move(d); };
  const shown = [...(slide.leaving != null && slide.leaving !== front ? [{ i: slide.leaving, role: "out" as const }] : []), { i: front, role: "in" as const }];
  return (
    <nav className="tg-pill" aria-label="Quick actions" data-away={away || undefined} inert={away || undefined}>
      <Link href="/" className="tg-pill__orb tg-pill__home" aria-label="Home" aria-current={path === "/" ? "page" : undefined}>
        <House aria-hidden className="size-5" strokeWidth={2.2} />
      </Link>
      <div
        className="tg-drum"
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        {n > 1 ? <button type="button" className="tg-drum__nav tg-drum__nav--prev" aria-label="Previous" onClick={() => go(-1)}><ChevronLeft aria-hidden className="size-4" strokeWidth={2.6} /></button> : null}
        <div
          className="tg-drum__ring"
          data-dir={slide.dir}
          onPointerDown={(e) => { swipe.current = { x: e.clientX, y: e.clientY, moved: false }; }}
          onPointerUp={(e) => {
            const s0 = swipe.current;
            if (!s0 || n < 2) return;
            const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
            if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) { s0.moved = true; go(dx < 0 ? 1 : -1); }
          }}
          onClickCapture={(e) => { if (swipe.current?.moved) { e.preventDefault(); e.stopPropagation(); } swipe.current = null; }}
        >
          {shown.map(({ i, role }) => {
            const f = faces[i]!;
            const Icon = f.icon;
            const on = role === "in";
            return (
              <Link
                // A new key per move replays the slide-in.
                key={on ? `${f.key}-${slide.turn}` : `${f.key}-out`}
                href={f.href}
                prefetch={f.prefetch}
                className={`tg-drum__face tg-drum__face--${f.tone}`}
                data-slide={on && !moved.current ? undefined : role}
                draggable={false}
                aria-hidden={!on || undefined}
                tabIndex={on ? undefined : -1}
                data-front={on || undefined}
              >
                <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.4} />
                <span>{f.text}</span>
                {f.chip ? <em>{f.chip}</em> : null}
              </Link>
            );
          })}
        </div>
        {n > 1 ? <button type="button" className="tg-drum__nav tg-drum__nav--next" aria-label="Next" onClick={() => go(1)}><ChevronRight aria-hidden className="size-4" strokeWidth={2.6} /></button> : null}
      </div>
      <WhatsAppDockLink className="tg-pill__orb tg-pill__wa" />
    </nav>
  );
}
