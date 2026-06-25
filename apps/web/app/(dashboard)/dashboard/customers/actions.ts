"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { createCustomer } from "@/lib/services/customers.service";

type Source = { sourceKey: string; subSourceKey?: string };
type Contact = { fullName: string; phone: string; email?: string };
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
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/inquiries");
  return { customerPublicId: publicId, inquiryId };
}
