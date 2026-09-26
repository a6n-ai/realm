import { getAppSettings } from "@/lib/services/app-settings.service";
import { currentUserId } from "@/lib/services/session-service";
import { getContactOnFile } from "@/lib/services/contact-on-file";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { Checkout } from "@/components/checkout/checkout";
import { addressService } from "@/lib/services/addresses.service";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [{ defaultCountry }, userId] = await Promise.all([getAppSettings(), currentUserId()]);
  const closeHref = userId != null ? "/me" : "/";

  // A logged-in customer already has contact/address on file — checkout is exactly the
  // moment that friction shows up most (renewing, re-subscribing), so pre-fill from their
  // account instead of asking them to retype it. Name and email come back read-only and are
  // re-taken from the session server-side; phone and address are editable for this order only.
  const orgId = await resolveRequestOrg();
  const catalog = toClientCatalog(await loadCatalogSnapshot(orgId));
  const prefill = userId != null ? ((await getContactOnFile(userId)) ?? undefined) : undefined;
  const savedAddresses = userId != null ? await addressService.list({ userId, orgId }) : [];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-4 sm:py-10">
      <Checkout defaultCountry={defaultCountry} closeHref={closeHref} prefill={prefill} catalog={catalog} savedAddresses={savedAddresses} />
    </main>
  );
}
