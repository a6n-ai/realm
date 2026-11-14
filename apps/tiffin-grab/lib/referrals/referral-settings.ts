import { z } from "zod";
import { ValidationError } from "@foundry/commons";
import { settingsCache, saveSetting } from "@/lib/settings";
import { db } from "@/db/client";
import { app } from "@/db/schema";

export type ReferralSettings = { mode: "flat" | "pct"; referrerValue: number; friendValue: number; maxPerReferrer: number | null };

/** Referral rewards. Both values 0 = referrals off. Read on every paid order. */
export async function getReferralSettings(): Promise<ReferralSettings> {
  return settingsCache.getOrSet("referral", async () => {
    const [row] = await db.select({
      mode: app.referralMode,
      referrerValue: app.referralReferrerValue,
      friendValue: app.referralFriendValue,
      maxPerReferrer: app.referralMaxPerReferrer,
    }).from(app).limit(1);
    return row ?? { mode: "flat", referrerValue: 0, friendValue: 0, maxPerReferrer: null };
  });
}

const referralSettingsSchema = z.object({
  mode: z.enum(["flat", "pct"]),
  referrerValue: z.number().int().min(0),
  friendValue: z.number().int().min(0),
  maxPerReferrer: z.number().int().min(1).nullable(),
}).refine((s) => s.mode === "flat" || (s.referrerValue <= 100 && s.friendValue <= 100), {
  message: "A percent reward must be between 0 and 100",
});

export async function setReferralSettings(input: unknown): Promise<void> {
  const parsed = referralSettingsSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid referral settings");
  const s = parsed.data;
  const values = {
    referralMode: s.mode,
    referralReferrerValue: s.referrerValue,
    referralFriendValue: s.friendValue,
    referralMaxPerReferrer: s.maxPerReferrer,
  };
  await saveSetting(values);
}
