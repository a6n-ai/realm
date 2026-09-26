"use server";

import { revalidatePath } from "next/cache";
import type { AddressInput, SavedAddress } from "@foundry/address";
import { AuthError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { addressScopeFor, addressService } from "@/lib/services/addresses.service";
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

export async function createMyAddress(input: AddressInput): Promise<ActionResult<SavedAddress>> {
  return runAction(async () => {
    const { id: _id, ...saved } = await addressService.create(await scope(), input);
    refresh();
    return saved;
  });
}

export async function updateSavedAddress(publicId: string, input: AddressInput): Promise<ActionResult<SavedAddress>> {
  return runAction(async () => {
    const saved = await addressService.update(await scope(), publicId, input);
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
