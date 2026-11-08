"use client";

import Link from "next/link";
import { usePublicSession } from "@/lib/auth/public-session";

const REFER_TAB = "/me/refer";

/** A customer's own link lives on their Refer tab; anyone else signs in on the way there.
 *  One label for both, so the swap after the session loads doesn't shift layout. */
export function ReferCta() {
  const { data: session } = usePublicSession();
  const signedIn = !!session?.user;
  return (
    <Link prefetch={false} href={signedIn ? REFER_TAB : `/login?callbackUrl=${encodeURIComponent(REFER_TAB)}`} className="lp-cta tg-refer__cta">
      Get my link
    </Link>
  );
}
