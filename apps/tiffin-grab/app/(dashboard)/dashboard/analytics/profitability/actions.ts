"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/action-result";
import { parseInput, staffAction } from "@/lib/actions/staff-action";
import { setProfitabilityAssumptions } from "@/lib/analytics/profitability-settings";

const PATH = "/dashboard/analytics/profitability";
const SETTINGS_PATH = "/dashboard/settings/costing";

const money = z.number().min(0).max(1_000_000);

const schema = z.object({
  driverCostPerTiffin: money,
  otherCostPerTiffin: money,
  marketingMonthly: money,
  salaryMonthly: money,
  otherMonthly: money,
  targetMarginPct: z.number().min(0).max(95),
  minMarginPct: z.number().min(0).max(95),
}).refine((v) => v.minMarginPct <= v.targetMarginPct, { message: "The minimum margin cannot be above the target" });

export async function saveAssumptionsAction(input: unknown): Promise<ActionResult> {
  return staffAction({ guard: { settings: ["write"] }, revalidate: [PATH, SETTINGS_PATH] }, async () => {
    await setProfitabilityAssumptions(parseInput(schema, input));
  });
}
