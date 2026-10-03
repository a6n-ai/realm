import Link from "next/link";
import { redirect } from "next/navigation";
import { listCheckoutPaymentMethods } from "@/app/(public)/subscribe/actions";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { currentUserId } from "@/lib/services/session-service";
import { getSession } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/landing";
import { getContactOnFile } from "@/lib/services/contact-on-file";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { Checkout } from "@/components/checkout/checkout";
import { addressService } from "@/lib/services/addresses.service";
import { dropOffsFor } from "@/lib/services/address-drop-off.service";
import { couponsService } from "@/lib/services/coupons.service";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  // Same gate as /subscribe. Staff can't own an order (createOrder refuses),
  // and a staff invitee who hasn't set a password yet must not browse the
  // customer flow as signed in — /dashboard sends them to /set-password first.
  const session = await getSession();
  if (session?.user && isStaffRole(session.user.role)) redirect("/dashboard");

  const [{ defaultCountry }, userId] = await Promise.all([getAppSettings(), currentUserId()]);
  // No guest checkout: every order needs a signed-in owner (payment proof upload on
  // /activate is owner-only). The /subscribe email step signs everyone in.
  if (userId == null) redirect("/subscribe");

  // Pre-fill from the account. Name and email come back read-only and are re-taken from the
  // session server-side; phone and address are editable for this order only.
  const orgId = await resolveRequestOrg();
  const catalog = toClientCatalog(await loadCatalogSnapshot(orgId));
  const prefill = (await getContactOnFile(userId)) ?? undefined;
  const savedAddresses = await addressService.list({ userId, orgId });
  const addressDropOffs = await dropOffsFor(savedAddresses.map((a) => a.publicId));
  // Auto-apply coupons land on their own; only codes a customer must type are worth suggesting.
  const suggestedCoupons = (await couponsService.listAvailable()).filter((c) => !c.autoApply);

  // Simulated payment is local-only; prod with no rail enabled can't take an order.
  if (process.env.NODE_ENV === "production" && (await listCheckoutPaymentMethods()).length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sorry, checkout is unavailable</h1>
        <p className="text-muted-foreground text-pretty">Payments aren&apos;t set up yet. Please contact admin.</p>
        <Link href="/me" className="mt-2 text-sm font-semibold underline underline-offset-4">Back to your account</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:py-10">
      <Checkout defaultCountry={defaultCountry} closeHref="/me" prefill={prefill} catalog={catalog} savedAddresses={savedAddresses} addressDropOffs={addressDropOffs} suggestedCoupons={suggestedCoupons} />
    </main>
  );
}
