import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";

export type ContactOnFile = {
  fullName: string;
  email: string;
  phone: string;
  addressLine: string;
  addressUnit: string;
  city: string;
  postalCode: string;
};

/**
 * A logged-in customer's contact details as the business already knows them.
 *
 * Shared by the checkout page (to pre-fill) and confirmSubscription (to enforce
 * that a renewal keeps these details), so the address a renewing customer is
 * shown is exactly the address their order is placed with.
 *
 * Name/email/phone come from the account. The address comes from the most
 * recent order first: users.addressLine is rarely populated (nothing has
 * historically written back to it), whereas every real customer has a delivery
 * address on their last order.
 */
export async function getContactOnFile(userId: bigint): Promise<ContactOnFile | null> {
  const [[profile], [lastOrder]] = await Promise.all([
    db
      .select({
        name: users.name,
        email: users.email,
        phone: users.phone,
        addressLine: users.addressLine,
        addressUnit: users.addressUnit,
        city: users.city,
        postalCode: users.postalCode,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        fullName: orders.fullName,
        addressLine: orders.addressLine,
        addressUnit: orders.addressUnit,
        city: orders.city,
        postalCode: orders.postalCode,
      })
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(1),
  ]);
  if (!profile) return null;

  // Take the address as one unit from a single source. Mixing a line from the
  // last order with a city from the profile could assemble an address that
  // exists nowhere.
  const address = lastOrder?.addressLine
    ? lastOrder
    : { addressLine: profile.addressLine, addressUnit: profile.addressUnit, city: profile.city, postalCode: profile.postalCode };

  return {
    // Account name first: it is the name the session carries and confirmSubscription enforces.
    fullName: profile.name || lastOrder?.fullName || "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    addressLine: address.addressLine ?? "",
    addressUnit: address.addressUnit ?? "",
    city: address.city ?? "",
    postalCode: address.postalCode ?? "",
  };
}
