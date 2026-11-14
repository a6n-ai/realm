import { ValidationError } from "@foundry/commons";
import { parseAssumptions, type ProfitabilityAssumptions } from "./profitability";
import { settingsCache, saveSetting } from "@/lib/settings";
import { db } from "@/db/client";
import { app } from "@/db/schema";

export async function getProfitabilityAssumptions(): Promise<ProfitabilityAssumptions> {
  return settingsCache.getOrSet("profitabilityAssumptions", async () => {
    const [row] = await db.select({ v: app.profitabilityAssumptions }).from(app).limit(1);
    return parseAssumptions(row?.v);
  });
}

export async function setProfitabilityAssumptions(input: ProfitabilityAssumptions): Promise<void> {
  const parsed = parseAssumptions(input);
  for (const [k, v] of Object.entries(parsed)) {
    if (v > 1_000_000) throw new ValidationError(`${k} is too large`);
  }
  await saveSetting({ profitabilityAssumptions: parsed });
}
