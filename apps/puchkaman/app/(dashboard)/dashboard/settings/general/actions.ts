"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { setMinOrderValue } from "@/lib/services/integrations.service";

const PATH = "/dashboard/settings/general";

const minOrderSchema = z.object({ minOrderValue: z.number().nonnegative() });

export async function saveMinOrderValue(input: unknown): Promise<void> {
  await requireAdmin();
  const data = minOrderSchema.parse(input);
  await setMinOrderValue(data.minOrderValue);
  revalidatePath(PATH);
}
