"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { attempt } from "@/lib/actions/guard";
import { personalizationService } from "@/lib/services/personalization.service";

const PATH = "/dashboard/settings/personalization";

async function run(fn: () => Promise<unknown>, fallback: string): Promise<{ error?: string }> {
  await requireAdmin();
  const r = await attempt(fn, fallback);
  if ("error" in r) return r;
  revalidatePath(PATH);
  return {};
}

export async function createQuestionAction(input: {
  prompt: string;
  type: string;
  options: string[];
  required: boolean;
}): Promise<{ error?: string }> {
  return run(() => personalizationService.create(input), "Could not create the question");
}

export async function updateQuestionAction(
  publicId: string,
  input: {
    prompt: string;
    type: string;
    options: string[];
    required: boolean;
    active: boolean;
  },
): Promise<{ error?: string }> {
  return run(() => personalizationService.update(publicId, input), "Could not save the question");
}

export async function deleteQuestionAction(publicId: string): Promise<{ error?: string }> {
  return run(() => personalizationService.remove(publicId), "Could not delete the question");
}

export async function reorderQuestionsAction(publicIds: string[]): Promise<{ error?: string }> {
  return run(() => personalizationService.reorder(publicIds), "Could not reorder questions");
}
