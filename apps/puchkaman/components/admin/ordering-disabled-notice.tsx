import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { getCloverConnection, toPublicCloverConnection } from "@foundry/clover";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

/**
 * Tells staff why the website is not taking orders.
 *
 * `isPublicOrderingEnabled` needs Ecommerce credentials on top of a connected
 * Clover, and without them every public surface quietly shows "Coming soon". The
 * Clover settings page already says so, but nobody wondering "why are there no
 * orders?" is looking at settings — they are looking at this list.
 *
 * Silent until Clover is actually connected: before that, ordering being off is
 * expected rather than a misconfiguration worth flagging.
 */
export async function OrderingDisabledNotice() {
  const clover = toPublicCloverConnection(await getCloverConnection(integrationsConfigStore));
  if (!clover.connected || clover.ecommerceReady) return null;

  return (
    <div className="border-warn/40 bg-warn/10 text-warn flex items-start gap-2.5 rounded-lg border p-3 text-sm">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">The website is not taking orders.</p>
        <p className="text-warn/90">
          Clover is connected and syncing, but the Ecommerce API credentials are missing, so
          customers see &quot;Coming soon&quot; instead of a cart. Add the public key and
          private token in{" "}
          <Link href="/dashboard/settings/clover" className="underline underline-offset-2">
            Settings → Clover
          </Link>{" "}
          to start accepting orders.
        </p>
      </div>
    </div>
  );
}
