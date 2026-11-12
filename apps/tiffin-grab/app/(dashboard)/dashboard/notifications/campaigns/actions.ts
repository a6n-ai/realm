"use server";

import { redirect } from "next/navigation";
import { createCampaign } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { campaignDeps } from "@/lib/notifications/deps";

/** Draft-first: the campaign exists from the first click, so autosave has somewhere to write. */
export async function createDraftCampaign(formData: FormData): Promise<void> {
  await requireAdmin();
  const channel = formData.get("channel");
  const picked = channel === "sms" || channel === "whatsapp" ? channel : "email";
  const { publicId } = await createCampaign(
    campaignDeps,
    { name: "Untitled campaign", channels: [picked], audience: {} },
  );
  redirect(`/dashboard/notifications/campaigns/${publicId}?step=content`);
}
