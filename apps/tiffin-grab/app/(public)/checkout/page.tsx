import { getAppSettings } from "@/lib/services/app-settings.service";
import { currentUserId } from "@/lib/services/session-service";
import { Checkout } from "@/components/checkout/checkout";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [{ defaultCountry }, userId] = await Promise.all([getAppSettings(), currentUserId()]);
  const closeHref = userId != null ? "/me" : "/";
  return (
    <main className="mx-auto max-w-4xl px-4 py-4 sm:py-10">
      <Checkout defaultCountry={defaultCountry} closeHref={closeHref} />
    </main>
  );
}
