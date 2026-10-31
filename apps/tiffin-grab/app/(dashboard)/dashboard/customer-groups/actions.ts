"use server";

import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { searchCustomers } from "@/lib/services/customers.service";
import { currentUserId } from "@/lib/services/session-service";
import { createCustomerGroup } from "@/lib/services/customer-groups.service";
import {
  listOrderCities,
  listPayoutCandidates,
  type PayoutCandidate,
  type PayoutCandidateFilters,
} from "@/lib/services/customer-payouts.service";

export async function searchAccounts(query: string) {
  await requireAdmin();
  return searchCustomers(query);
}

export async function getOrderCities(): Promise<string[]> {
  await requireAdmin();
  return listOrderCities();
}

const payoutFiltersSchema = z.object({
  accountPublicId: z.string().trim().min(1).nullish(),
  revenueOp: z.enum([">", "<", "="]).nullish(),
  revenueValue: z.number().nullish(),
  startDateFrom: z.string().trim().min(1).nullish(),
  startDateTo: z.string().trim().min(1).nullish(),
  city: z.string().trim().min(1).nullish(),
  lastTiffinFrom: z.string().trim().min(1).nullish(),
  lastTiffinTo: z.string().trim().min(1).nullish(),
  lapsed: z.boolean().nullish(),
  lapsedFrom: z.string().trim().min(1).nullish(),
  lapsedTo: z.string().trim().min(1).nullish(),
});

export async function getPayoutCandidates(input: unknown): Promise<{ rows: PayoutCandidate[]; total: number }> {
  await requireAdmin();
  const filters = payoutFiltersSchema.parse(input) satisfies PayoutCandidateFilters;
  return listPayoutCandidates(filters);
}

const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Name the group").max(120),
  filters: z.record(z.string(), z.unknown()),
  userPublicIds: z.array(z.string().trim().min(1)).min(1, "Pick at least one customer"),
});

export async function createGroupAction(input: unknown): Promise<{ publicId: string }> {
  await requireAdmin();
  const data = createGroupSchema.parse(input);
  const rows = await db.select({ id: users.id }).from(users).where(inArray(users.publicId, data.userPublicIds));
  const group = await createCustomerGroup(
    { name: data.name, filters: data.filters, userIds: rows.map((r) => r.id) },
    await currentUserId(),
  );
  revalidatePath("/dashboard/customer-groups");
  return group;
}
