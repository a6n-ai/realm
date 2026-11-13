"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/action-result";
import { parseInput, staffAction } from "@/lib/actions/staff-action";
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

export async function saveAssumptionsAction(input: unknown): Promise<ActionResult> {
  return staffAction({ guard: "admin", revalidate: [PATH] }, async () => {
    await setProfitabilityAssumptions(parseInput(schema, input));
  });
}
