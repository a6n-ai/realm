"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guards";
import { listAllFaqs, retireFaq, saveFaq } from "@/lib/services/faqs.service";
import { resolveOrgScopeMode } from "@/lib/services/org-scope";

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
  revalidatePath("/");
}

export async function saveFaqAction(values: FaqFormValues): Promise<{ error?: string; publicId?: string }> {
  await requirePermission({ settings: ["write"] });
  const parsed = faqSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;

  try {
    // New rows are scoped by which org is acting: a brand admin (scopeMode
    // "all") writes the shared default (organizationId null); a franchise
    // admin writes their own override row. Edits of an existing row keep
    // whatever scope it already has — only saveFaq's create path stamps this.
    const scopeMode = v.publicId ? null : await resolveOrgScopeMode();
    const values2 = v.publicId
      ? { question: v.question, answer: v.answer, active: v.active }
      : {
          question: v.question,
          answer: v.answer,
          active: v.active,
          organizationId: scopeMode?.mode === "org" ? scopeMode.orgId : null,
          sortOrder: (await listAllFaqs()).length,
        };
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
