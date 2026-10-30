import type { ReactNode } from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { getSession } from "@/lib/auth/session";
import {
  NoFranchiseAccessError,
  resolveAnalyticsScope,
  type AnalyticsScope,
  type ScopeSearchParams,
} from "@/lib/services/analytics/metrics/scope";

export function FranchiseUnavailable({ href }: { href: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Franchise not available</AlertTitle>
      <AlertDescription>
        You don&apos;t have access to this franchise.{" "}
        <Link href={href} className="underline underline-offset-2">
          Show all my franchises
        </Link>
      </AlertDescription>
    </Alert>
  );
}

/** The scope, or the alert to render in its place when the `org` URL value is not one the viewer can see. */
export async function scopeOrAlert(
  path: string,
  sp: ScopeSearchParams,
): Promise<{ scope: AnalyticsScope; alert: null } | { scope: null; alert: ReactNode }> {
  try {
    return { scope: await resolveAnalyticsScope(sp, await getSession()), alert: null };
  } catch (e) {
    if (!(e instanceof NoFranchiseAccessError) || e.reason !== "org_not_visible") throw e;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "org" && v) qs.set(k, v);
    const s = qs.toString();
    return { scope: null, alert: <FranchiseUnavailable href={s ? `${path}?${s}` : path} /> };
  }
}
