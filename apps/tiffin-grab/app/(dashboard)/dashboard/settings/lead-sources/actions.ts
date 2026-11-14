"use server";

import { eq } from "drizzle-orm";
import { NotFoundError } from "@foundry/commons";
import { staffAction } from "@/lib/actions/staff-action";
import type { ActionResult } from "@/lib/actions/action-result";
import { db } from "@/db/client";
import { leadSources } from "@/db/schema";
import { leadSourceService, leadSubsourceService } from "@/lib/inquiries/lead-sources.service";

const OPTS = { guard: "admin", revalidate: ["/dashboard/settings/lead-sources"] } as const;

export async function saveSource(
  publicId: string | null,
  patch: { key: string; label: string; isInbound: boolean },
): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    if (publicId) await leadSourceService.update(publicId, patch);
    else await leadSourceService.create(patch);
  });
}

export async function saveSubsource(
  publicId: string | null,
  input: { sourcePublicId: string; key: string; label: string },
): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    // Resolve the parent here so no bigint id crosses the client boundary.
    const [src] = await db
      .select({ id: leadSources.id })
      .from(leadSources)
      .where(eq(leadSources.publicId, input.sourcePublicId))
      .limit(1);
    if (!src) throw new NotFoundError("Source not found");
    const patch = { sourceId: src.id, key: input.key, label: input.label };
    if (publicId) await leadSubsourceService.update(publicId, patch);
    else await leadSubsourceService.create(patch);
  });
}

export async function setSourceActive(publicId: string, active: boolean): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    await leadSourceService.update(publicId, { active });
  });
}

export async function setSubsourceActive(publicId: string, active: boolean): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    await leadSubsourceService.update(publicId, { active });
  });
}
