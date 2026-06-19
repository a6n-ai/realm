"use server";

import { generateCode, ValidationError } from "@tiffin/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { priceSubscription, type PricingSelections } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { hashPassword } from "@/lib/auth/password";
import { auth } from "@/lib/auth";

const TEMP_PASSWORD = "Tiffin123";

export interface ConfirmInput {
  selections: PricingSelections;
  planKey: string;
  contact: { fullName: string; email: string; addressLine: string; city: string; postalCode: string };
}

export async function confirmSubscription(input: ConfirmInput): Promise<{ deploymentId: string }> {
  const snapshot = await loadCatalogSnapshot();

  // Authoritative recompute — never trust client totals.
  const pricing = priceSubscription(input.selections, buildPricingCatalog(snapshot, input.selections));

  const plan = snapshot.plans.find((p) => p.key === input.planKey);
  if (!plan) throw new ValidationError("Invalid plan");
  const frequency = snapshot.frequencies.find((f) => f.key === input.selections.frequencyKey)!;
  const zone = matchZone(input.contact.postalCode, snapshot.zones);
  const zoneRow = zone ? snapshot.zones.find((z) => z.name === zone.name) : undefined;

  const session = await auth();
  const sessionUserId = session?.user?.id ?? null;

  // Wider code space (34^6 ≈ 1.5B) makes a deploymentId collision on the unique
  // column negligible without retry logic.
  const deploymentId = generateCode("SUB", 6);
  const passwordHash = sessionUserId ? null : await hashPassword(TEMP_PASSWORD);

  await db.transaction(async (tx) => {
    // Resolve/provision the customer INSIDE the tx so a failed order never
    // orphans a freshly created user; onConflict makes concurrent anonymous
    // checkouts with the same email race-safe.
    let userId = sessionUserId;
    if (!userId) {
      const inserted = await tx
        .insert(users)
        .values({ email: input.contact.email, name: input.contact.fullName, passwordHash, role: "user" })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      userId = inserted[0]?.id
        ?? (await tx.select({ id: users.id }).from(users).where(eq(users.email, input.contact.email)).limit(1))[0].id;
    }

    const [sub] = await tx.insert(orders).values({
      userId,
      planId: plan.id,
      mealSizeId: input.selections.mealSizeId,
      frequencyId: frequency.id,
      dailyQty: input.selections.dailyQty,
      includeSaturday: input.selections.includeSaturday,
      includeSunday: input.selections.includeSunday,
      isStudent: input.selections.isStudent,
      durationWeeks: input.selections.durationWeeks,
      pricingSnapshot: pricing,
      weeklyFee: pricing.weeklyFee.toFixed(2),
      total: pricing.total.toFixed(2),
      status: zoneRow ? "active" : "waitlisted",
      deploymentId,
      zoneId: zoneRow?.id ?? null,
      fullName: input.contact.fullName,
      addressLine: input.contact.addressLine,
      city: input.contact.city,
      postalCode: input.contact.postalCode,
    }).returning({ id: orders.id });

    await tx.insert(payments).values({
      orderId: sub.id, status: "simulated_paid", amount: pricing.total.toFixed(2),
    });
  });

  return { deploymentId };
}
