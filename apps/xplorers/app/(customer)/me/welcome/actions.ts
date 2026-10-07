"use server";

import { NotFoundError, ValidationError } from "@foundry/commons";
import { personalizationService } from "@/lib/services/personalization.service";

function err(e: unknown, fallback: string): { error: string } {
  if (e instanceof ValidationError || e instanceof NotFoundError) return { error: e.message };
  console.error(e);
  return { error: fallback };
}

export async function answerPersonalizationAction(
  questionPublicId: string,
  value: string | string[],
  edit = false,
): Promise<{ error?: string; done?: boolean }> {
  try {
    const { done } = await personalizationService.answer(questionPublicId, value, edit ? { edit: true } : undefined);
    return { done };
  } catch (e) {
    return err(e, "Could not save your answer");
  }
}

export async function skipPersonalizationAction(
  questionPublicId: string,
  edit = false,
): Promise<{ error?: string; done?: boolean }> {
  try {
    const { done } = await personalizationService.skip(questionPublicId, edit ? { edit: true } : undefined);
    return { done };
  } catch (e) {
    return err(e, "Could not skip");
  }
}
