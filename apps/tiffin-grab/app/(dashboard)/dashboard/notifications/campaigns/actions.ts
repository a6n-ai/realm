"use server";

import { redirect } from "next/navigation";
import { createCampaign } from "@relay/engine";
import { requirePermission } from "@/lib/auth/guards";
import { campaignDeps } from "@/lib/notifications/deps";
import { assertCampaignsOnEngine } from "@/lib/notifications/relay-moved";

/** Draft-first: the campaign exists from the first click, so autosave has somewhere to write. */
export async function createDraftCampaign(formData: FormData): Promise<void> {
  await requirePermission({ notification: ["write"] });
  assertCampaignsOnEngine();
  const channel = formData.get("channel");
  const picked = channel === "sms" || channel === "whatsapp" ? channel : "email";
  const { publicId } = await createCampaign(
    campaignDeps,
    { name: "Untitled campaign", channels: [picked], audience: {} },
  );
  redirect(`/dashboard/notifications/campaigns/${publicId}?step=content`);
}
