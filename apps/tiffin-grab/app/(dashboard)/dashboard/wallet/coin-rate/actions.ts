"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { setMaxWalletBalance } from "@/lib/services/app-settings.service";

const PATH = "/dashboard/wallet";

const walletCapSchema = z.object({
  maxWalletBalance: z.number().int().positive().nullable(),
});

export async function setWalletCapAction(input: unknown): Promise<void> {
  await requireAdmin();
  const data = walletCapSchema.parse(input);
  await setMaxWalletBalance(data.maxWalletBalance);
  revalidatePath(PATH, "layout");
}
