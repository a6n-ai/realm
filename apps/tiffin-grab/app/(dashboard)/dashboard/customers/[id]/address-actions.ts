"use server";

import { revalidatePath } from "next/cache";
import type { AddressInput, SavedAddress } from "@foundry/address";
import { requireAdmin } from "@/lib/auth/guards";
import { addressScopeFor, addressService } from "@/lib/services/addresses.service";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";

// Admin-only, always scoped to the customer whose page this is. Returns { error } rather
// than throwing so validation messages survive production's server-action redaction.

async function scope(customerPublicId: string) {
  await requireAdmin();
  return addressScopeFor(customerPublicId);
}

const refresh = (customerPublicId: string) => revalidatePath(`/dashboard/customers/${customerPublicId}`);

export async function staffCreateAddress(customerPublicId: string, input: AddressInput): Promise<ActionResult<SavedAddress>> {
  return runAction(async () => {
    const { id: _id, ...saved } = await addressService.create(await scope(customerPublicId), input);
    refresh(customerPublicId);
    return saved;
  });
}

export async function staffUpdateAddress(customerPublicId: string, publicId: string, input: AddressInput): Promise<ActionResult<SavedAddress>> {
  return runAction(async () => {
    const saved = await addressService.update(await scope(customerPublicId), publicId, input);
    refresh(customerPublicId);
    return saved;
  });
}

export async function staffSetDefaultAddress(customerPublicId: string, publicId: string): Promise<ActionResult> {
  return runAction(async () => {
    await addressService.setDefault(await scope(customerPublicId), publicId);
    refresh(customerPublicId);
  });
}

export async function staffArchiveAddress(customerPublicId: string, publicId: string): Promise<ActionResult<{ movedToDefault: boolean }>> {
  return runAction(async () => {
    const result = await addressService.archive(await scope(customerPublicId), publicId);
    refresh(customerPublicId);
    return result;
  });
}
