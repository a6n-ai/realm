"use server";

import { revalidatePath } from "next/cache";
import { reviewNudgeStore } from "@/lib/services/review-nudge.service";
import { getSession } from "@/lib/auth/session";

export async function markReviewNudgeDone(): Promise<void> {
  const session = await getSession();
  const email = session?.user?.email;
  if (!email) return;
  await reviewNudgeStore.markDone(email);
  revalidatePath("/me");
}
