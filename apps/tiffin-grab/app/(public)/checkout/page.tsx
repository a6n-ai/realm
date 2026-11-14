import { redirect } from "next/navigation";
import { customerFunnelUserId } from "@/lib/account/funnel-entry";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { Checkout } from "@/components/checkout/checkout";
import { CheckoutUnavailable } from "@/components/checkout/checkout-unavailable";
import { loadCheckoutProps } from "@/lib/checkout/load-props";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const userId = await customerFunnelUserId();
  // No guest checkout: every order needs a signed-in owner (payment proof upload on
  // /activate is owner-only). The /subscribe email step signs everyone in.
  if (userId == null) redirect("/subscribe");

  const props = await loadCheckoutProps(await resolveRequestOrg());
  if (!props) return <CheckoutUnavailable />;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-4 sm:pb-10">
      <Checkout {...props} closeHref="/me" />
    </main>
  );
}
