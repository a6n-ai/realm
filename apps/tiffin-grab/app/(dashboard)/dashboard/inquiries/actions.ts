"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import {
  assertInquiriesVisible,
  inquiriesService,
  type ActivityType,
  type LostReason,
} from "@/lib/services/inquiries.service";
import { ValidationError } from "@foundry/commons";
import { z } from "zod";
import { SUB_STATUS_META, isClosed, type SubStatus } from "@/lib/inquiries/status";
import { runAction, type ActionResult } from "@/lib/actions/action-result";
import { QUICK_ADD_MAX, parsePastedPhones } from "./quick-add/parse-phones";

// Every action returns { error } instead of throwing: production redacts thrown messages and the
// POST shows up as a 500, so staff saw a generic error for a plain validation miss.

/** Staff only, and every lead touched must be in one of the viewer's organizations (franchise staff never reach another franchise's leads). */
async function guardInquiries(...ids: string[]): Promise<void> {
  await requireStaff();
  await assertInquiriesVisible(ids, await resolveSessionVisibleOrgIds(await getSession()));
}

export async function createInquiry(input: {
  fullName?: string;
  phone?: string;
  whatsappPhone?: string;
  email?: string;
  sourceKey: string;
  subSourceKey?: string;
  subStatus?: SubStatus;
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
  return runAction(async () => {
    await requireStaff();
    // Same person (phone or email) with an open inquiry: logged there as a re-inquiry.
    const { inquiry, folded } = await inquiriesService.createOrFold(input);
    revalidatePath("/dashboard/inquiries");
    return { publicId: inquiry.publicId, folded, fullName: inquiry.fullName };
  });
}

/** Rush-time bulk add: each pasted number becomes a "Lead <n>" lead, or folds into its open lead. */
export async function quickAddInquiries(input: { text: string; sourceKey: string; subSourceKey?: string }): Promise<
  ActionResult<{ added: number; folded: number; failed: { phone: string; error: string }[] }>
> {
  return runAction(async () => {
    await requireStaff();
    const { phones, tooMany } = parsePastedPhones(input.text);
    if (tooMany) throw new ValidationError(`Paste at most ${QUICK_ADD_MAX} numbers at a time`);
    if (!phones.length) throw new ValidationError("Paste at least one phone number");
    let added = 0;
    let folded = 0;
    const failed: { phone: string; error: string }[] = [];
    // Sequential: createOrFold owns dedup and owner rotation, and two same-person rows must fold, not race.
    for (const phone of phones) {
      try {
        const r = await inquiriesService.createOrFold({ phone, sourceKey: input.sourceKey, subSourceKey: input.subSourceKey });
        if (r.folded) folded++;
        else added++;
      } catch (e) {
        if (!(e instanceof ValidationError)) throw e;
        failed.push({ phone, error: e.message });
      }
    }
    revalidatePath("/dashboard/inquiries");
    return { added, folded, failed };
  });
}

export async function updateInquiryContact(
  inquiryId: string,
  input: { fullName?: string | null; phone?: string | null; whatsappPhone?: string | null; email?: string | null },
): Promise<ActionResult<{ fullName: string | null }>> {
  return runAction(async () => {
    await guardInquiries(inquiryId);
    const inq = await inquiriesService.updateContact(inquiryId, input);
    revalidatePath("/dashboard/inquiries");
    revalidatePath(`/dashboard/inquiries/${inquiryId}`);
    return { fullName: inq.fullName };
  });
}

export async function logActivity(
  inquiryId: string,
  input: { type: ActivityType; outcome?: string; note?: string; nextFollowUpAt?: number; amount?: number },
) {
  return runAction(async () => {
    await guardInquiries(inquiryId);
    await inquiriesService.logActivity(inquiryId, input);
    revalidatePath(`/dashboard/inquiries/${inquiryId}`);
    revalidatePath("/dashboard/inquiries");
  });
}

export async function clearFollowUp(inquiryId: string): Promise<ActionResult> {
  return runAction(async () => {
    await requireStaff();
    const parsed = z.string().trim().min(1).max(64).safeParse(inquiryId);
    if (!parsed.success) throw new ValidationError("Invalid inquiry");
    const id = parsed.data;
    await guardInquiries(id);
    await inquiriesService.clearFollowUp(id);
    revalidatePath(`/dashboard/inquiries/${id}`);
    revalidatePath("/dashboard/inquiries");
  });
}

export async function updateStatus(
  inquiryId: string,
  input: { subStatus: SubStatus | null; note?: string; nextFollowUpAt?: number | null; lostReason?: LostReason },
): Promise<ActionResult<{ previous: SubStatus | null }>> {
  return runAction(async () => {
    await guardInquiries(inquiryId);
    const { previous } = await inquiriesService.setStatus(inquiryId, input);
    revalidatePath("/dashboard/inquiries");
    revalidatePath(`/dashboard/inquiries/${inquiryId}`);
    return { previous };
  });
}

export async function addNote(inquiryId: string, note: string, nextFollowUpAt?: number) {
  return runAction(async () => {
    await guardInquiries(inquiryId);
    await inquiriesService.addNote(inquiryId, note, nextFollowUpAt);
    revalidatePath(`/dashboard/inquiries/${inquiryId}`);
    revalidatePath("/dashboard/inquiries");
  });
}

export async function reassignInquiry(inquiryId: string, ownerId: string): Promise<ActionResult> {
  return runAction(async () => {
    await guardInquiries(inquiryId);
    await inquiriesService.reassign(inquiryId, ownerId);
    revalidatePath("/dashboard/inquiries");
    revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  });
}

export async function reassignInquiries(inquiryIds: string[], ownerId: string) {
  return runAction(async () => {
    await guardInquiries(...inquiryIds);
    const count = await inquiriesService.reassignMany(inquiryIds, ownerId);
    revalidatePath("/dashboard/inquiries");
    return { count };
  });
}

export async function bulkSetStatus(
  inquiryIds: string[],
  subStatus: SubStatus,
): Promise<ActionResult<{ updated: number; skipped: number }>> {
  return runAction(async () => {
    await requireStaff();
    const ids = [...new Set(inquiryIds)];
    if (ids.length > 200) throw new ValidationError("Update at most 200 inquiries at a time");
    await guardInquiries(...ids);
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
  });
}
