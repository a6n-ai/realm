"use server";

import type { AddressInput, SavedAddress } from "@foundry/address";
import { staffAction } from "@/lib/actions/staff-action";
import { addressScopeFor, addressService } from "@/lib/services/addresses.service";
import { assertAddressServiceable } from "@/lib/catalog/zone-match";
import type { ActionResult } from "@/lib/actions/action-result";

// Admin-only, always scoped to the customer whose page this is.
const opts = (customerPublicId: string) =>
  ({ guard: "admin", revalidate: [[`/dashboard/customers/${customerPublicId}`, "layout"]] }) as const;

export async function staffCreateAddress(customerPublicId: string, input: AddressInput): Promise<ActionResult<SavedAddress>> {
  return staffAction(opts(customerPublicId), async () => {
    const s = await addressScopeFor(customerPublicId);
    await assertAddressServiceable(input, s.orgId);
    const { id: _id, ...saved } = await addressService.create(s, input);
    return saved;
  });
}

export async function staffUpdateAddress(customerPublicId: string, publicId: string, input: AddressInput): Promise<ActionResult<SavedAddress>> {
  return staffAction(opts(customerPublicId), async () => {
    const s = await addressScopeFor(customerPublicId);
    await assertAddressServiceable(input, s.orgId);
    return addressService.update(s, publicId, input);
  });
}

export async function staffSetDefaultAddress(customerPublicId: string, publicId: string): Promise<ActionResult> {
  return staffAction(opts(customerPublicId), async () => {
    await addressService.setDefault(await addressScopeFor(customerPublicId), publicId);
  });
}

export async function staffArchiveAddress(customerPublicId: string, publicId: string): Promise<ActionResult<{ movedToDefault: boolean }>> {
  return staffAction(opts(customerPublicId), async () => addressService.archive(await addressScopeFor(customerPublicId), publicId));
}
