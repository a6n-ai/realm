"use server";

import { redirect } from "next/navigation";
import { createCampaign } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

/** Draft-first: the campaign exists from the first click, so autosave has somewhere to write. */
export async function createDraftCampaign(formData: FormData): Promise<void> {
  await requireAdmin();
  const channel = formData.get("channel");
  const picked = channel === "sms" || channel === "whatsapp" ? channel : "email";
  const { publicId } = await createCampaign(
    { db, tables: notificationTables, users: usersRef, resolveSegment },
    { name: "Untitled campaign", channels: [picked], audience: {} },
  );
  redirect(`/dashboard/notifications/campaigns/${publicId}?step=content`);
}
