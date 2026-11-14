"use server";

import { z } from "zod";
import { parseInput, staffAction } from "@/lib/actions/staff-action";
import type { ActionResult } from "@/lib/actions/action-result";
import { setProvinceTaxes } from "@/lib/tax/province-taxes";
import { PROVINCES } from "@/lib/tax/canada";

const taxLineSchema = z.object({
  name: z.string().trim().min(1).max(20),
  ratePct: z.number().min(0).max(100),
});
// Keyed only by known province codes, so a crafted request can't park rates
// under a key checkout would never read (or would misread).
const provinceTaxesSchema = z.record(z.enum(PROVINCES), z.array(taxLineSchema).max(4));

export async function setProvinceTaxesAction(input: unknown): Promise<ActionResult> {
  return staffAction({ guard: "admin", revalidate: ["/dashboard/settings/payments/checkout-rules"] }, async () => {
    await setProvinceTaxes(parseInput(provinceTaxesSchema, input));
  });
}
