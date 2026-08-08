"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { retireDeliveryType, saveDeliveryType } from "@/lib/delivery/zones.service";
import { currentUserId, recordAudit } from "@/lib/services/session-service";

const typeSchema = z.object({
  publicId: z.string().nullable(),
  // Immutable after creation — ignored entirely on update, see saveDeliveryTypeAction.
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, "lowercase letters, digits, underscores; starts with a letter"),
  label: z.string().trim().min(1, "Label is required"),
  description: z
    .string()
    .trim()
    .transform((s) => (s === "" ? null : s))
    .nullable(),
  requiresAddress: z.boolean(),
  requiresSchedule: z.boolean(),
  minSubtotal: z.number().min(0, "Must be 0 or more"),
  discountPct: z.number().min(0).max(100, "Must be between 0 and 100"),
  sortOrder: z.number().int(),
  active: z.boolean(),
});

export type TypeFormValues = z.input<typeof typeSchema>;

function revalidate() {
  revalidatePath("/dashboard/catalogue/delivery-types");
  revalidatePath("/dashboard/catalogue/delivery-zones");
}

export async function saveDeliveryTypeAction(values: TypeFormValues): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = typeSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;

  const patch: Record<string, unknown> = {
    label: v.label,
    description: v.description,
    requiresAddress: v.requiresAddress,
    requiresSchedule: v.requiresSchedule,
    minSubtotal: v.minSubtotal,
    discountPct: v.discountPct,
    sortOrder: v.sortOrder,
    active: v.active,
  };
  // key is set once at creation and rendered read-only on edit — never let a
  // resubmitted edit form patch it, even if the client sent one.
  if (!v.publicId) patch.key = v.key;

  try {
    await saveDeliveryType(v.publicId, patch);
  } catch (err) {
    if (err instanceof Error && /unique|duplicate/i.test(err.message)) {
      return { error: `Key "${v.key}" is already in use` };
    }
    return { error: err instanceof Error ? err.message : "Save failed" };
  }

  await recordAudit({
    entity: "delivery_types",
    entityPublicId: v.publicId ?? v.key,
    operation: v.publicId ? "update" : "create",
    changes: patch,
    createdBy: await currentUserId(),
  });

  revalidate();
  return {};
}

export async function retireDeliveryTypeAction(publicId: string): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    await retireDeliveryType(publicId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Retire failed" };
  }
  await recordAudit({
    entity: "delivery_types",
    entityPublicId: publicId,
    operation: "update",
    changes: { active: false },
    createdBy: await currentUserId(),
  });
  revalidate();
  return {};
}
