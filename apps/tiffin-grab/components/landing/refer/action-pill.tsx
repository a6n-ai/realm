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

/** The public site's floating dock, at every width: a Home orb, a drum in the middle and a WhatsApp
 *  orb. The drum is a cylinder that turns between the live promotion, the referral bonus and Order
 *  now; the face in front is the button. It pauses under the pointer or focus, and holds still on
 *  Order now with reduced motion. Renders nothing on the server (no hydration mismatch) and in the
 *  order flow. It replaces the header's Build my tiffin. */
export function ActionPill({ label, refer, promo }: { label: string | null; refer?: string | null; promo?: DockPromo | null }) {
  const path = usePathname();
  const [mounted, setMounted] = useState(false);
  const away = useHeroInView(path, mounted);
  const { data: session } = useSession();
  const [turn, setTurn] = useState(0);
  const [held, setHeld] = useState(false);
  const [faceW, setFaceW] = useState(200);
  const ring = useRef<HTMLDivElement>(null);
  const manual = useRef(0);
  const swipe = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  useEffect(() => setMounted(true), []);
  // Faces are as wide as the ring; the radius follows (CSS sets the width per breakpoint).
  useEffect(() => {
    const el = ring.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setFaceW(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);

  const role = (session?.user as { role?: RoleValue } | undefined)?.role;
  // Same rule as the header: signed in goes home (running plan, renewals), else a new order.
  const orderHref = session?.user ? roleLanding(role ?? Role.USER) : "/subscribe";
  const faces: Face[] = [
    ...(promo ? [{ key: "promo", href: promo.href, tone: "promo" as const, icon: TicketPercent, text: promo.text, chip: promo.code, prefetch: false }] : []),
    ...(label ? [{ key: "refer", href: "/refer", tone: "refer" as const, icon: Gift, text: refer ?? label }] : []),
    { key: "order", href: orderHref, tone: "order" as const, icon: UtensilsCrossed, text: "Order now", prefetch: false },
  ];
  const n = faces.length;

  useEffect(() => {
    if (!mounted || n < 2 || held || away || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => { if (!document.hidden && Date.now() - manual.current > MANUAL_HOLD_MS) setTurn((v) => v + 1); }, TURN_MS);
    return () => clearInterval(t);
  }, [mounted, n, held, away]);

  if (!mounted || !pillVisible(path)) return null;
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Arrows and swipes always work; with reduced motion the drum rests on Order now until one is used.
  const base = reduce && manual.current === 0 ? n - 1 : 0;
  const front = (((turn + base) % n) + n) % n;
  const step = 360 / n;
  // Distance from the vertical axis to each face, so n faces of faceW close into a ring.
  const r = n === 1 ? 0 : n === 2 ? faceW / 2 : faceW / 2 / Math.tan(Math.PI / n);
  const spin = (turn + base) * step;
  const go = (d: number) => { manual.current = Date.now(); setTurn((v) => v + d); };
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
          ref={ring}
          className="tg-drum__ring"
          onPointerDown={(e) => { swipe.current = { x: e.clientX, y: e.clientY, moved: false }; }}
          onPointerUp={(e) => {
            const s0 = swipe.current;
            if (!s0 || n < 2) return;
            const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
            if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) { s0.moved = true; go(dx < 0 ? 1 : -1); }
          }}
          onClickCapture={(e) => { if (swipe.current?.moved) { e.preventDefault(); e.stopPropagation(); } swipe.current = null; }}
        >
        <div className="tg-drum__in" style={{ transform: `translateZ(${-r}px) rotateY(${-spin}deg)` }}>
          {faces.map((f, i) => {
            const Icon = f.icon;
            const on = i === front;
            return (
              <Link
                key={f.key}
                href={f.href}
                prefetch={f.prefetch}
                className={`tg-drum__face tg-drum__face--${f.tone}`}
                style={{ transform: `rotateY(${i * step}deg) translateZ(${r}px)` }}
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
        </div>
        {n > 1 ? <button type="button" className="tg-drum__nav tg-drum__nav--next" aria-label="Next" onClick={() => go(1)}><ChevronRight aria-hidden className="size-4" strokeWidth={2.6} /></button> : null}
      </div>
      <WhatsAppDockLink className="tg-pill__orb tg-pill__wa" />
    </nav>
  );
}
