"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Gift, House, UtensilsCrossed } from "lucide-react";
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

/** The public site's floating bar, at every width: Home, Refer and Order. It replaces the header's
 *  Build my tiffin. Renders nothing on the server (no hydration mismatch) and in the order flow.
 *  `label` null = referral program off, so no Refer. */
export function ActionPill({ label }: { label: string | null }) {
  const path = usePathname();
  const [mounted, setMounted] = useState(false);
  const away = useHeroInView(path, mounted);
  const { data: session } = useSession();
  useEffect(() => setMounted(true), []);
  if (!mounted || !pillVisible(path)) return null;
  const role = (session?.user as { role?: RoleValue } | undefined)?.role;
  // Same rule as the header: signed in goes home (running plan, renewals), else a new order.
  const orderHref = session?.user ? roleLanding(role ?? Role.USER) : "/subscribe";
  return (
    <nav className="tg-pill" aria-label="Quick actions" data-away={away || undefined} inert={away || undefined}>
      <Link href="/" className="tg-pill__home" aria-label="Home" aria-current={path === "/" ? "page" : undefined}>
        <House aria-hidden className="size-5" strokeWidth={2.2} />
      </Link>
      {label ? (
        <Link href="/refer" className="tg-pill__refer" aria-current={path === "/refer" || path.startsWith("/refer/") ? "page" : undefined}>
          <Gift aria-hidden className="size-4" strokeWidth={2.4} />{label}
        </Link>
      ) : null}
      <Link prefetch={false} href={orderHref} className="tg-pill__order">
        <UtensilsCrossed aria-hidden className="size-4" strokeWidth={2.4} />Order <ArrowRight aria-hidden className="size-4" strokeWidth={2.4} />
      </Link>
      <WhatsAppDockLink className="tg-pill__wa" />
    </nav>
  );
}
