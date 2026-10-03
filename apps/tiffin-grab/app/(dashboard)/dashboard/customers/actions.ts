"use server";

import { revalidatePath } from "next/cache";
import { createLogger } from "@foundry/commons/logger";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { createCustomer, customerInviteUrl, invitePendingCustomers, sendCustomerInvite } from "@/lib/services/customers.service";
import { sendMenuReminderToCustomer } from "@/lib/notifications/menu-reminder";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";

const log = createLogger("customers-actions");

type Source = { sourceKey: string; subSourceKey?: string };
// Email is required on every account — it is the login path.
type Contact = { fullName: string; phone: string; email: string };
type Interest = {
  planInterest?: string;
  mealSizeInterest?: string;
  personsInterest?: number;
  frequencyKeyInterest?: string;
  eatingDaysInterest?: string[];
  postalCode?: string;
  preferredStart?: string;
  quotedPrice?: number;
};

export async function createCustomerFlow(input: {
  source: Source;
  contact: Contact;
  interest?: Interest;
  pickedInquiryId?: string;
}): Promise<{ customerPublicId: string; inquiryId: string }> {
  await requireStaff();
  const inquiryId = await inquiriesService.resolveForSource({
    phone: input.contact.phone,
    sourceKey: input.source.sourceKey,
    contact: { fullName: input.contact.fullName, email: input.contact.email },
    interest: { ...input.interest, subSourceKey: input.source.subSourceKey },
    pickedId: input.pickedInquiryId,
  });
  const actorId = (await getSession())?.user?.id ?? null;
  const { publicId } = await createCustomer(input.contact, { actorId });
  // Best-effort: an account created by staff already exists and is usable even
  // if the mail fails — "Resend invite" on their page covers a retry.
  try {
    await sendCustomerInvite(input.contact.email);
  } catch (err) {
    log.error({ err }, "invite email failed for admin-created customer");
  }
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/inquiries");
  return { customerPublicId: publicId, inquiryId };
}

// Staff send/resend of the welcome sign-in link. Throws (not best-effort) so
// the row's button can surface a real failure to the admin.
export async function resendCustomerInvite(email: string): Promise<void> {
  await requireStaff();
  await sendCustomerInvite(email);
}

// Same single-use sign-in link as the welcome email, handed to staff to share
// over WhatsApp/SMS. Nothing is mailed.
export async function copyCustomerInviteLink(email: string): Promise<string> {
  await requireStaff();
  return customerInviteUrl(email);
}

/** Latest released week's menu reminder to one customer (Customers list row action). */
export async function sendCustomerMenuReminder(customerPublicId: string): Promise<ActionResult<{ queued: number }>> {
  return runAction(async () => {
    await requireStaff();
    return sendMenuReminderToCustomer(customerPublicId);
  });
}

/** "Invite all pending": welcome email to every customer who hasn't used their account yet. */
export async function inviteAllPendingCustomers(): Promise<ActionResult<{ sent: number; failed: number }>> {
  return runAction(async () => {
    // Admin only: one press mails every pending customer.
    await requireAdmin();
    const r = await invitePendingCustomers();
    revalidatePath("/dashboard/customers");
    return r;
  });
}
