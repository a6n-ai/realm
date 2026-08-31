"use server";

import { revalidatePath } from "next/cache";
import { createLogger } from "@foundry/commons/logger";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { createCustomer, sendAccountSetupEmail } from "@/lib/services/customers.service";

const log = createLogger("customers-actions");

type Source = { sourceKey: string; subSourceKey?: string };
// Email is required on every account — it is the login path.
type Contact = { fullName: string; phone: string; email: string };
type Interest = {
  planInterest?: string;
  mealSizeInterest?: string;
  personsInterest?: number;
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
    await sendAccountSetupEmail(input.contact.email);
  } catch (err) {
    log.error({ err }, "invite email failed for admin-created customer");
  }
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/inquiries");
  return { customerPublicId: publicId, inquiryId };
}

// Admin-only resend of the "set your password" invite link. Throws (not
// best-effort) so the row's button can surface a real failure to the admin.
export async function resendCustomerInvite(email: string): Promise<void> {
  await requireStaff();
  await sendAccountSetupEmail(email);
}
