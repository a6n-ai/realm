"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ValidationError } from "@foundry/commons";
import { sanitizeEmailHtml } from "@relay/engine";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { requireAdmin } from "@/lib/auth/guards";
import { PROMO_PLACEMENTS } from "@/db/schema/promotions";
import { promotionsService } from "@/lib/services/promotions.service";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable());

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  blurb: optText(160),
  body: z.string().max(200_000).nullable(),
  html: z.string().max(200_000).nullable(),
  // Uploads come back as /api/files/... unless FILES_PUBLIC_BASE_URL points at the CDN.
  imageUrl: z.preprocess(emptyToNull, z.string().trim().regex(/^(\/api\/files\/|https?:\/\/)/, "Upload an image or use an http(s) link").max(500).nullable()),
  couponCode: optText(64),
  ctaLabel: z.string().trim().min(1, "Button label is required").max(40),
  ctaHref: z.preprocess(emptyToNull, z.string().trim().regex(/^(\/(?!\/)|https?:\/\/)/, "Link must start with / or https://").max(500).nullable()),
  placements: z.array(z.enum(PROMO_PLACEMENTS)).min(1, "Pick at least one place to show it"),
  startsAt: z.number().int().nullable(),
  endsAt: z.number().int().nullable(),
  active: z.boolean(),
  priority: z.number().int().min(-1000).max(1000),
}).refine((v) => v.startsAt == null || v.endsAt == null || v.endsAt > v.startsAt, { message: "End must be after start", path: ["endsAt"] });

export type PromotionInput = z.input<typeof schema>;

export async function savePromotionAction(publicId: string | null, input: PromotionInput): Promise<ActionResult<{ publicId: string }>> {
  return runAction(async () => {
    await requireAdmin();
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid promotion");
    const v = parsed.data;
    const couponCode = v.couponCode ? await promotionsService.assertLinkableCoupon(v.couponCode) : null;
    // Stored html is rendered on the public site, so it always goes through the email sanitizer first.
    const html = v.html?.trim() ? sanitizeEmailHtml(v.html).html : null;
    const values = { ...v, couponCode, html, body: v.body?.trim() ? v.body : null };
    const row = publicId ? await promotionsService.update(publicId, values) : await promotionsService.create(values);
    revalidatePath("/");
    revalidatePath("/dashboard/settings/promotions", "layout");
    return { publicId: row.publicId, message: "Promotion saved" };
  });
}

export async function setPromotionActiveAction(publicId: string, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    await promotionsService.update(publicId, { active });
    revalidatePath("/");
    revalidatePath("/dashboard/settings/promotions", "layout");
    return active ? "Promotion switched on" : "Promotion switched off";
  });
}
