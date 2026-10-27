import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/services/session-service";
import { getSession } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/landing";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { Checkout } from "@/components/checkout/checkout";
import { CheckoutUnavailable } from "@/components/checkout/checkout-unavailable";
import { loadCheckoutProps } from "@/lib/checkout/load-checkout-props";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  // Same gate as /subscribe. Staff can't own an order (createOrder refuses),
  // and a staff invitee who hasn't set a password yet must not browse the
  // customer flow as signed in — /dashboard sends them to /set-password first.
  const session = await getSession();
  if (session?.user && isStaffRole(session.user.role)) redirect("/dashboard");

  const userId = await currentUserId();
  // No guest checkout: every order needs a signed-in owner (payment proof upload on
  // /activate is owner-only). The /subscribe email step signs everyone in.
  if (userId == null) redirect("/subscribe");

  const props = await loadCheckoutProps(userId, session!.user.id, await resolveRequestOrg());
  if (!props) return <CheckoutUnavailable />;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-4 sm:pb-10">
      <Checkout {...props} closeHref="/me" />
    </main>
  );
}
