"use server";

import { ValidationError, NotFoundError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { getContactListMember } from "@relay/engine";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { getSession } from "@/lib/auth/session";
import { createCustomer, findExistingByContact, sendCustomerInvite } from "@/lib/services/customers.service";
import { campaignDeps } from "@/lib/notifications/deps";

const log = createLogger("contact-list-actions");

/**
 * Turn one contact-list row into a customer account. A CSV import only
 * guarantees name + (email or phone) — provisioning a customer needs both, so
 * whichever one the row is missing must come from `overrides` here, filled in
 * by the admin at conversion time rather than at import time.
 */
export async function convertContactToCustomer(input: {
  listPublicId: string;
  memberPublicId: string;
  email?: string;
  phone?: string;
}): Promise<ActionResult<{ customerPublicId: string; alreadyExisted: boolean }>> {
  return staffAction({ guard: "admin", revalidate: ["/dashboard/notifications/contact-lists", "/dashboard/customers"] }, async () => {
    const member = await getContactListMember(campaignDeps, input.memberPublicId);
    if (!member) throw new NotFoundError("Contact not found");

    const email = member.email ?? input.email?.trim();
    const phone = member.phone ?? input.phone?.trim();
    if (!email) throw new ValidationError("This contact has no email — enter one to create an account");
    if (!phone) throw new ValidationError("This contact has no phone — enter one to create an account");

    const existing = await findExistingByContact(phone, email);
    if (existing) return { customerPublicId: existing.publicId, alreadyExisted: true };

    const actorId = (await getSession())?.user?.id ?? null;
    const { publicId } = await createCustomer(
      { fullName: member.name ?? "Customer", phone, email },
      { actorId },
    );
    try {
      await sendCustomerInvite(email);
    } catch (err) {
      log.error({ err }, "invite email failed for contact-list conversion");
    }
    return { customerPublicId: publicId, alreadyExisted: false };
  });
}
