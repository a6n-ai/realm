"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/action-result";
import { ValidationError } from "@foundry/commons";
import { staffAction, type StaffActionOpts } from "@/lib/actions/staff-action";
import { getSession } from "@/lib/auth/session";
import { retireFaq, saveFaq } from "@/lib/landing/faqs.service";

const faqSchema = z.object({
  publicId: z.string().nullable(),
  question: z.string().trim().min(1, "Question is required"),
  answer: z.string().trim().min(1, "Answer is required"),
  active: z.boolean(),
});

export type FaqFormValues = z.input<typeof faqSchema>;

const OPTS: StaffActionOpts = { guard: { settings: ["write"] }, revalidate: ["/dashboard/settings/public-website/faq"] };

export async function saveFaqAction(values: FaqFormValues): Promise<ActionResult<{ publicId: string }>> {
  return staffAction(OPTS, async () => {
    const parsed = faqSchema.safeParse(values);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
    const v = parsed.data;
    // A create stamps the acting org (session.session.activeOrganizationId):
    // set → this org's own override row, unset → the shared brand default.
    // An edit keeps whatever scope the row already has.
    let values2: Record<string, unknown> = { question: v.question, answer: v.answer, active: v.active };
    if (!v.publicId) {
      const session = await getSession();
      values2 = { ...values2, organizationId: session?.session.activeOrganizationId ?? null };
    }
    const faq = await saveFaq(v.publicId, values2);
    return { publicId: faq.publicId };
  });
}

export async function retireFaqAction(publicId: string): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    await retireFaq(publicId);
  });
}
