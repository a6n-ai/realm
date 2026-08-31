"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { apiKeys, tenants } from "@/db/schema";
import { generateApiKey } from "@/lib/api-keys";

export async function createTenantAction(formData: FormData): Promise<{ secret?: string; error?: string }> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!name || !slug) return { error: "Name and slug are required" };
  try {
    const [tenant] = await db.insert(tenants).values({ name, slug }).returning();
    const key = generateApiKey();
    await db.insert(apiKeys).values({
      tenantId: tenant.id,
      name: "default",
      keyPrefix: key.prefix,
      keyHash: key.hash,
    });
    revalidatePath("/dashboard/tenants");
    return { secret: key.secret };
  } catch {
    return { error: "Could not create tenant (slug may already exist)" };
  }
}
