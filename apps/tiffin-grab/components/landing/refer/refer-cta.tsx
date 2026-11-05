"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth/client";

const REFER_TAB = "/me/refer";

/** A customer's own link lives on their Refer tab; anyone else signs in on the way there.
 *  Both labels share one button size, so the swap after the session loads doesn't shift layout. */
export function ReferCta() {
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  return (
    <Link prefetch={false} href={signedIn ? REFER_TAB : `/login?callbackUrl=${encodeURIComponent(REFER_TAB)}`} className="tg-cta tg-refer__cta">
      {signedIn ? "Get my link" : "Sign in to get your link"}
    </Link>
  );
}
