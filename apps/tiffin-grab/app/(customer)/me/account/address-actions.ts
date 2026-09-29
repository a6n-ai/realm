"use server";

import { revalidatePath } from "next/cache";
import type { AddressInput, SavedAddress } from "@foundry/address";
import { AuthError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { addressScopeFor, addressService } from "@/lib/services/addresses.service";
import { resolveDropOff, setAddressDropOff } from "@/lib/services/address-drop-off.service";
import type { DropOffValue } from "@/lib/catalog/drop-off";
import { assertAddressServiceable } from "@/lib/catalog/zone-match";
import { runAction, type ActionResult } from "../action-result";

// Every action returns { error } instead of throwing: production builds redact thrown
// server-action errors, and "that address is outside every zone" must reach the customer.

async function scope() {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();
  return addressScopeFor(session.user.id);
}

function refresh() {
  revalidatePath("/me/account");
  revalidatePath("/me", "layout");
}

/**
 * `dropOff`: the place type and delivery strategies this address is delivered with; null
 * clears them,
 * undefined leaves it. Checked before the address is written so a bad pick saves nothing.
 */
export async function createMyAddress(input: AddressInput, dropOff?: DropOffValue | null): Promise<ActionResult<SavedAddress>> {
  return runAction(async () => {
    const s = await scope();
    await resolveDropOff(dropOff);
    await assertAddressServiceable(input, s.orgId);
    const { id, ...saved } = await addressService.create(s, input);
    if (dropOff !== undefined) await setAddressDropOff(s, { id }, dropOff);
    refresh();
    return saved;
  });
}

export async function updateSavedAddress(publicId: string, input: AddressInput, dropOff?: DropOffValue | null): Promise<ActionResult<SavedAddress>> {
  return runAction(async () => {
    const s = await scope();
    await resolveDropOff(dropOff);
    await assertAddressServiceable(input, s.orgId);
    const saved = await addressService.update(s, publicId, input);
    if (dropOff !== undefined) await setAddressDropOff(s, { publicId }, dropOff);
    refresh();
    return saved;
  });
}

export async function setMyDefaultAddress(publicId: string): Promise<ActionResult> {
  return runAction(async () => {
    await addressService.setDefault(await scope(), publicId);
    refresh();
  });
}

export async function archiveMyAddress(publicId: string): Promise<ActionResult<{ movedToDefault: boolean }>> {
  return runAction(async () => {
    const result = await addressService.archive(await scope(), publicId);
    refresh();
    return result;
  });
}
