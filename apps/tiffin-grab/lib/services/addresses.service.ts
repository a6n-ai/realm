import { eq } from "drizzle-orm";
import type { AddressScope } from "@foundry/address";
import { createAddressService } from "@foundry/address/service";
import { resolveAndPersist } from "@foundry/places";
import { db } from "@/db/client";
import { customerAddresses, users } from "@/db/schema";
import { currentUserId, recordAudit } from "@/lib/services/session-service";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { addressHooks } from "./address-propagation";

export const addressService = createAddressService({
  db,
  tables: { customerAddresses },
  // Stored coordinates: AWS only (see @foundry/places resolveAndPersist).
  geocode: async (address) => {
    const hit = await resolveAndPersist({ address });
    return hit ? { lat: hit.lat, lng: hit.lng } : null;
  },
  currentUserId,
  audit: async (e) => recordAudit({ ...e, createdBy: await currentUserId() }),
  hooks: addressHooks,
});

/** Session user public id (users.public_id) → the scope every address call needs. */
export async function addressScopeFor(userPublicId: string): Promise<AddressScope> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId)).limit(1);
  if (!u) throw new Error("User not found");
  return { userId: u.id, orgId: await resolveRequestOrg() };
}
