"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { currentUserId } from "@/lib/services/session-service";
import { walletService } from "@/lib/services/wallet.service";

export async function adjustCustomerCoinsAction(
  customerPublicId: string,
  input: { coins: number; memo: string },
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, customerPublicId)).limit(1);
    if (!user) throw new ValidationError("Customer not found.");
    await walletService.adjust({ userId: user.id, coins: input.coins, memo: input.memo, actorId: await currentUserId() });
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/dashboard/customers/${customerPublicId}`);
  return {};
}
