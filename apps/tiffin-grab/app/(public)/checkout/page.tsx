import { redirect } from "next/navigation";
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
  // No guest checkout: every order needs a signed-in owner (payment proof upload on
  // /activate is owner-only). The /subscribe email step signs everyone in.
  if (userId == null) redirect("/subscribe");

  // Pre-fill from the account. Name and email come back read-only and are re-taken from the
  // session server-side; phone and address are editable for this order only.
  const orgId = await resolveRequestOrg();
  const catalog = toClientCatalog(await loadCatalogSnapshot(orgId));
  const prefill = (await getContactOnFile(userId)) ?? undefined;
  const savedAddresses = await addressService.list({ userId, orgId });

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-4 sm:py-10">
      <Checkout defaultCountry={defaultCountry} closeHref="/me" prefill={prefill} catalog={catalog} savedAddresses={savedAddresses} />
    </main>
  );
}
