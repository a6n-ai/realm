import { getAppSettings } from "@/lib/services/app-settings.service";
import { Checkout } from "@/components/checkout/checkout";

// Reads runtime app-settings from the DB — must not be statically prerendered
// at build time (no DB in the build container).
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const { defaultCountry } = await getAppSettings();
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <div className="mt-8"><Checkout defaultCountry={defaultCountry} /></div>
    </main>
  );
}
