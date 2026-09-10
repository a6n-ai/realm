"use server";

import { revalidatePath } from "next/cache";
import { ValidationError, NotFoundError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { getContactListMember } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";
import { createCustomer, findExistingByContact, sendAccountSetupEmail } from "@/lib/services/customers.service";

const log = createLogger("contact-list-actions");
const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };

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
}): Promise<{ customerPublicId: string; alreadyExisted: boolean }> {
  await requireAdmin();
  const member = await getContactListMember(deps, input.memberPublicId);
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
    await sendAccountSetupEmail(email);
  } catch (err) {
    log.error({ err }, "invite email failed for contact-list conversion");
  }
  revalidatePath("/dashboard/notifications/contact-lists");
  revalidatePath("/dashboard/customers");
  return { customerPublicId: publicId, alreadyExisted: false };
}
