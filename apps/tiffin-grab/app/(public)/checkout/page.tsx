import { getAppSettings } from "@/lib/services/app-settings.service";
import { currentUserId } from "@/lib/services/session-service";
import { getContactOnFile } from "@/lib/services/contact-on-file";
import { Checkout } from "@/components/checkout/checkout";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [{ defaultCountry }, userId] = await Promise.all([getAppSettings(), currentUserId()]);
  const closeHref = userId != null ? "/me" : "/";

  // A logged-in customer already has contact/address on file — checkout is exactly the
  // moment that friction shows up most (renewing, re-subscribing), so pre-fill from their
  // account instead of asking them to retype it. For a new subscription it only seeds the
  // form; on a renewal the email and address are locked to it (see confirmSubscription).
  const prefill = userId != null ? ((await getContactOnFile(userId)) ?? undefined) : undefined;

  return (
    <main className="mx-auto max-w-4xl px-4 py-4 sm:py-10">
      <Checkout defaultCountry={defaultCountry} closeHref={closeHref} prefill={prefill} />
    </main>
  );
}
