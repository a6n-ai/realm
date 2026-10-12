import { redirect } from "next/navigation";
import { createCampaign } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

// Creating on load is deliberate: the draft must exist for autosave to have somewhere to write.
// Links here set prefetch={false} so a hover never creates one.
export const dynamic = "force-dynamic";

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  await requireAdmin();
  const { channel } = await searchParams;
  const picked = channel === "sms" || channel === "whatsapp" ? channel : "email";
  const { publicId } = await createCampaign(
    { db, tables: notificationTables, users: usersRef, resolveSegment },
    { name: "Untitled campaign", channels: [picked], audience: {} },
  );
  redirect(`/dashboard/notifications/campaigns/${publicId}?step=content`);
}
