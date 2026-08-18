import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { currentUserId } from "@/lib/services/session-service";
import { Checkout } from "@/components/checkout/checkout";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [{ defaultCountry }, userId] = await Promise.all([getAppSettings(), currentUserId()]);
  const closeHref = userId != null ? "/me" : "/";

  // A logged-in customer already has contact/address on file — checkout is exactly the
  // moment that friction shows up most (renewing, re-subscribing), so pre-fill from their
  // account instead of asking them to retype it. Still fully editable: this only seeds
  // the form's initial state, never gates or overrides what they type.
  //
  // Name/email/phone come from the account itself (set at signup, always present). The
  // address does NOT — users.addressLine is essentially never populated in practice, since
  // nothing has ever written back to it. What every real customer does have is a delivery
  // address on their most recent order, so that's the actual source of truth here.
  const [[profile], [lastOrder]] = userId != null
    ? await Promise.all([
        db
          .select({ name: users.name, email: users.email, phone: users.phone, addressLine: users.addressLine, city: users.city, postalCode: users.postalCode })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),
        db
          .select({ fullName: orders.fullName, addressLine: orders.addressLine, city: orders.city, postalCode: orders.postalCode })
          .from(orders)
          .where(eq(orders.userId, userId))
          .orderBy(desc(orders.createdAt))
          .limit(1),
      ])
    : [[], []];
  const prefill = profile
    ? {
        fullName: lastOrder?.fullName ?? profile.name ?? "",
        email: profile.email ?? "",
        phone: profile.phone ?? "",
        addressLine: lastOrder?.addressLine ?? profile.addressLine ?? "",
        city: lastOrder?.city ?? profile.city ?? "",
        postalCode: lastOrder?.postalCode ?? profile.postalCode ?? "",
      }
    : undefined;

  return (
    <main className="mx-auto max-w-4xl px-4 py-4 sm:py-10">
      <Checkout defaultCountry={defaultCountry} closeHref={closeHref} prefill={prefill} />
    </main>
  );
}
