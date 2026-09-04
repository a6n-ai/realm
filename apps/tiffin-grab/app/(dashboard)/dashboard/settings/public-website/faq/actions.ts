"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { retireFaq, saveFaq } from "@/lib/services/faqs.service";

const faqSchema = z.object({
  publicId: z.string().nullable(),
  question: z.string().trim().min(1, "Question is required"),
  answer: z.string().trim().min(1, "Answer is required"),
  active: z.boolean(),
});

export type FaqFormValues = z.input<typeof faqSchema>;

function revalidate() {
  revalidatePath("/dashboard/settings/public-website/faq");
  revalidatePath("/faq");
}

export async function saveFaqAction(values: FaqFormValues): Promise<{ error?: string; publicId?: string }> {
  await requirePermission({ settings: ["write"] });
  const parsed = faqSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;

  try {
    // A create stamps the acting org (session.session.activeOrganizationId):
    // set → this org's own override row, unset → the shared brand default.
    // An edit keeps whatever scope the row already has.
    let values2: Record<string, unknown> = { question: v.question, answer: v.answer, active: v.active };
    if (!v.publicId) {
      const session = await getSession();
      values2 = { ...values2, organizationId: session?.session.activeOrganizationId ?? null };
    }
    const faq = await saveFaq(v.publicId, values2);
    revalidate();
    return { publicId: faq.publicId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Save failed" };
  }
}

export async function retireFaqAction(publicId: string): Promise<{ error?: string }> {
  await requirePermission({ settings: ["write"] });
  try {
    await retireFaq(publicId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Retire failed" };
  }
  revalidate();
  return {};
}
