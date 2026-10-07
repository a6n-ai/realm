"use server";

import { revalidatePath } from "next/cache";
import { NotFoundError, ValidationError } from "@foundry/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { personalizationService } from "@/lib/services/personalization.service";

const PATH = "/dashboard/settings/personalization";

function err(e: unknown, fallback: string): { error: string } {
  if (e instanceof ValidationError || e instanceof NotFoundError) return { error: e.message };
  console.error(e);
  return { error: fallback };
}

export async function createQuestionAction(input: {
  prompt: string;
  type: string;
  options: string[];
  required: boolean;
}): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    await personalizationService.create(input);
    revalidatePath(PATH);
    return {};
  } catch (e) {
    return err(e, "Could not create the question");
  }
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
  await requireAdmin();
  try {
    await personalizationService.update(publicId, input);
    revalidatePath(PATH);
    return {};
  } catch (e) {
    return err(e, "Could not save the question");
  }
}

export async function deleteQuestionAction(publicId: string): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    await personalizationService.remove(publicId);
    revalidatePath(PATH);
    return {};
  } catch (e) {
    return err(e, "Could not delete the question");
  }
}

export async function reorderQuestionsAction(publicIds: string[]): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    await personalizationService.reorder(publicIds);
    revalidatePath(PATH);
    return {};
  } catch (e) {
    return err(e, "Could not reorder questions");
  }
}
