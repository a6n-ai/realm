"use server";

import { revalidatePath } from "next/cache";
import { AuthError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { removeSavedCard as removeCard } from "@/lib/services/payment-stripe";
import { runAction, type ActionResult } from "../action-result";

export async function removeSavedCard(paymentMethodId: string): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSession();
    if (!session?.user?.id) throw new AuthError();
    await removeCard(session.user.id, paymentMethodId);
    revalidatePath("/me/account");
  });
}
