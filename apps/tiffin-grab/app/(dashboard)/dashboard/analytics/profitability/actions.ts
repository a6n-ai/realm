"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { setProfitabilityAssumptions } from "@/lib/services/app-settings.service";

const PATH = "/dashboard/analytics/profitability";

const money = z.number().min(0).max(1_000_000);

const schema = z.object({
  kitchenCostPerTiffin: money,
  driverCostPerTiffin: money,
  otherCostPerTiffin: money,
  marketingMonthly: money,
  salaryMonthly: money,
  otherMonthly: money,
});

export async function saveAssumptionsAction(input: unknown): Promise<void> {
  await requireAdmin();
  await setProfitabilityAssumptions(schema.parse(input));
  revalidatePath(PATH);
}
