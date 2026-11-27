"use server";

import { personalizationService } from "@/lib/services/personalization.service";
import { attempt } from "@/lib/actions/guard";

export async function answerPersonalizationAction(
  questionPublicId: string,
  value: string | string[],
  edit = false,
): Promise<{ error?: string; done?: boolean }> {
  const r = await attempt(() => personalizationService.answer(questionPublicId, value, edit ? { edit: true } : undefined), "Could not save your answer");
  return "error" in r ? r : { done: r.value.done };
}

export async function skipPersonalizationAction(
  questionPublicId: string,
  edit = false,
): Promise<{ error?: string; done?: boolean }> {
  const r = await attempt(() => personalizationService.skip(questionPublicId, edit ? { edit: true } : undefined), "Could not skip");
  return "error" in r ? r : { done: r.value.done };
}
