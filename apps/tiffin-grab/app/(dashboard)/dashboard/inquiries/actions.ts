"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import {
  inquiriesService,
  type ActivityType,
  type InquiryStage,
  type LostReason,
} from "@/lib/services/inquiries.service";

export async function createInquiry(input: {
  fullName: string;
  phone: string;
  email: string;
  sourceKey: string;
  subSourceKey?: string;
  planInterest?: string;
  mealSizeInterest?: string;
  personsInterest?: number;
  frequencyKeyInterest?: string;
  eatingDaysInterest?: string[];
  postalCode?: string;
  preferredStart?: string;
  quotedPrice?: number;
  notes?: string;
}) {
  await requireStaff();
  // Same person (phone or email) with an open inquiry: logged there as a re-inquiry.
  const { inquiry, folded } = await inquiriesService.createOrFold(input);
  revalidatePath("/dashboard/inquiries");
  return { publicId: inquiry.publicId, folded, fullName: inquiry.fullName };
}

export async function setStage(
  inquiryId: string,
  toStage: InquiryStage,
): Promise<{ previous: InquiryStage }> {
  await requireStaff();
  const { previous } = await inquiriesService.changeStage(inquiryId, toStage);
  revalidatePath("/dashboard/inquiries");
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  return { previous: previous as InquiryStage };
}

export async function logActivity(
  inquiryId: string,
  input: { type: ActivityType; outcome?: string; note?: string; nextFollowUpAt?: number; amount?: number },
) {
  await requireStaff();
  await inquiriesService.logActivity(inquiryId, input);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  revalidatePath("/dashboard/inquiries");
}

export async function markLost(inquiryId: string, reason: LostReason, note?: string) {
  await requireStaff();
  await inquiriesService.markLost(inquiryId, reason, note);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  revalidatePath("/dashboard/inquiries");
}

export async function addNote(inquiryId: string, note: string) {
  await requireStaff();
  await inquiriesService.addNote(inquiryId, note);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
}

export async function reassignInquiry(inquiryId: string, ownerId: string) {
  await requireStaff();
  await inquiriesService.reassign(inquiryId, ownerId);
  revalidatePath("/dashboard/inquiries");
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
}
