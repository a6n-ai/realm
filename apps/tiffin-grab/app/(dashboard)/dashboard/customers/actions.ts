"use server";

import { createLogger } from "@foundry/commons/logger";
import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { createCustomer, customerInviteUrl, invitePendingCustomers, sendCustomerInvite } from "@/lib/services/customers.service";
import { sendMenuReminderToCustomer } from "@/lib/notifications/menu-reminder";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";

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
}): Promise<ActionResult<{ customerPublicId: string; inquiryId: string }>> {
  return staffAction({ guard: "staff", revalidate: ["/dashboard/customers", "/dashboard/inquiries"] }, async () => {
    const inquiryId = await inquiriesService.resolveForSource({
      phone: input.contact.phone,
      sourceKey: input.source.sourceKey,
      contact: { fullName: input.contact.fullName, email: input.contact.email },
      interest: { ...input.interest, subSourceKey: input.source.subSourceKey },
      pickedId: input.pickedInquiryId,
      visible: await resolveSessionVisibleOrgIds(await getSession()),
    forOrder: true,
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
    return { customerPublicId: publicId, inquiryId };
  });
}

// Staff send/resend of the welcome sign-in link. Not best-effort: a failure is returned
// so the row's button can show it to the admin.
export async function resendCustomerInvite(email: string): Promise<ActionResult> {
  return staffAction({ guard: "staff" }, async () => {
    await sendCustomerInvite(email);
  });
}

// Same single-use sign-in link as the welcome email, handed to staff to share
// over WhatsApp/SMS. Nothing is mailed.
export async function copyCustomerInviteLink(email: string): Promise<ActionResult<{ url: string }>> {
  return staffAction({ guard: "staff" }, async () => ({ url: await customerInviteUrl(email) }));
}

/** Latest released week's menu reminder to one customer (Customers list row action). */
export async function sendCustomerMenuReminder(customerPublicId: string): Promise<ActionResult<{ queued: number }>> {
  return staffAction({ guard: "staff" }, () => sendMenuReminderToCustomer(customerPublicId));
}

/** "Invite all pending": welcome email to every pending customer. Admin only: one press mails them all. */
export async function inviteAllPendingCustomers(): Promise<ActionResult<{ sent: number; failed: number }>> {
  return staffAction({ guard: "admin", revalidate: ["/dashboard/customers"] }, () => invitePendingCustomers());
}
