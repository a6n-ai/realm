"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import {
  inquiriesService,
  type ActivityType,
  type LostReason,
} from "@/lib/services/inquiries.service";
import { ValidationError } from "@foundry/commons";
import { SUB_STATUS_META, isClosed, type SubStatus } from "@/lib/inquiries/status";

export async function createInquiry(input: {
  fullName?: string;
  phone?: string;
  email?: string;
  sourceKey: string;
  subSourceKey?: string;
  nextFollowUpAt?: number;
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

export async function logActivity(
  inquiryId: string,
  input: { type: ActivityType; outcome?: string; note?: string; nextFollowUpAt?: number; amount?: number },
) {
  await requireStaff();
  await inquiriesService.logActivity(inquiryId, input);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  revalidatePath("/dashboard/inquiries");
}

export async function updateStatus(
  inquiryId: string,
  input: { subStatus: SubStatus | null; note?: string; nextFollowUpAt?: number | null; lostReason?: LostReason },
): Promise<{ previous: SubStatus | null }> {
  await requireStaff();
  const { previous } = await inquiriesService.setStatus(inquiryId, input);
  revalidatePath("/dashboard/inquiries");
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  return { previous };
}

export async function addNote(inquiryId: string, note: string, nextFollowUpAt?: number) {
  await requireStaff();
  await inquiriesService.addNote(inquiryId, note, nextFollowUpAt);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  revalidatePath("/dashboard/inquiries");
}

export async function reassignInquiry(inquiryId: string, ownerId: string) {
  await requireStaff();
  await inquiriesService.reassign(inquiryId, ownerId);
  revalidatePath("/dashboard/inquiries");
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
}

export async function reassignInquiries(inquiryIds: string[], ownerId: string): Promise<number> {
  await requireStaff();
  const n = await inquiriesService.reassignMany(inquiryIds, ownerId);
  revalidatePath("/dashboard/inquiries");
  return n;
}

export async function bulkSetStatus(
  inquiryIds: string[],
  subStatus: SubStatus,
): Promise<{ updated: number; skipped: number }> {
  await requireStaff();
  const ids = [...new Set(inquiryIds)];
  if (ids.length > 200) throw new ValidationError("Update at most 200 inquiries at a time");
  if (isClosed(subStatus) ? subStatus !== "undeliverable" : !SUB_STATUS_META[subStatus].pickable) {
    throw new ValidationError("That status can't be set in bulk");
  }
  let updated = 0;
  let skipped = 0;
  for (const id of ids) {
    try {
      await inquiriesService.setStatus(id, { subStatus });
      updated++;
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      skipped++;
    }
  }
  revalidatePath("/dashboard/inquiries");
  return { updated, skipped };
}
