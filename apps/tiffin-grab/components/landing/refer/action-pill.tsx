"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Gift, House } from "lucide-react";
import { useSession } from "@/lib/auth/client";
import { roleLanding } from "@/lib/auth/landing";
import { Role, type RoleValue } from "@foundry/commons";
import { pillVisible } from "./pill-visible";
import "./action-pill.css";

/** The public site's floating bar, at every width: Home, Refer and Order. It replaces the header's
 *  Build my tiffin. Renders nothing on the server (no hydration mismatch) and in the order flow.
 *  `label` null = referral program off, so no Refer. */
export function ActionPill({ label }: { label: string | null }) {
  const path = usePathname();
  const [mounted, setMounted] = useState(false);
  const { data: session } = useSession();
  useEffect(() => setMounted(true), []);
  if (!mounted || !pillVisible(path)) return null;
  const role = (session?.user as { role?: RoleValue } | undefined)?.role;
  // Same rule as the header: signed in goes home (running plan, renewals), else a new order.
  const orderHref = session?.user ? roleLanding(role ?? Role.USER) : "/subscribe";
  return (
    <nav className="tg-pill" aria-label="Quick actions">
      <Link href="/" className="tg-pill__home" aria-label="Home" aria-current={path === "/" ? "page" : undefined}>
        <House aria-hidden className="size-5" strokeWidth={2.2} />
      </Link>
      {label ? (
        <Link href="/refer" className="tg-pill__refer" aria-current={path === "/refer" || path.startsWith("/refer/") ? "page" : undefined}>
          <Gift aria-hidden className="size-4" strokeWidth={2.4} />{label}
        </Link>
      ) : null}
      <Link prefetch={false} href={orderHref} className="tg-pill__order">
        Order <ArrowRight aria-hidden className="size-4" strokeWidth={2.4} />
      </Link>
    </nav>
  );
}
