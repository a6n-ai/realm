"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { leadSources } from "@/db/schema";
import { leadSourceService, leadSubsourceService } from "@/lib/services/lead-sources.service";

const PATH = "/dashboard/settings/lead-sources";

export async function saveSource(
  publicId: string | null,
  patch: { key: string; label: string; isInbound: boolean },
) {
  await requireAdmin();
  if (publicId) await leadSourceService.update(publicId, patch);
  else await leadSourceService.create(patch);
  revalidatePath(PATH);
}

export async function saveSubsource(
  publicId: string | null,
  input: { sourcePublicId: string; key: string; label: string },
) {
  await requireAdmin();
  // Resolve the parent here so no bigint id crosses the client boundary.
  const [src] = await db
    .select({ id: leadSources.id })
    .from(leadSources)
    .where(eq(leadSources.publicId, input.sourcePublicId))
    .limit(1);
  if (!src) throw new Error("Source not found");
  const patch = { sourceId: src.id, key: input.key, label: input.label };
  if (publicId) await leadSubsourceService.update(publicId, patch);
  else await leadSubsourceService.create(patch);
  revalidatePath(PATH);
}

export async function setSourceActive(publicId: string, active: boolean) {
  await requireAdmin();
  await leadSourceService.update(publicId, { active });
  revalidatePath(PATH);
}

export async function setSubsourceActive(publicId: string, active: boolean) {
  await requireAdmin();
  await leadSubsourceService.update(publicId, { active });
  revalidatePath(PATH);
}
