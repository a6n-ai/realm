import { desc } from "drizzle-orm";
import { BackButton, SectionCard } from "@foundry/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { app, contactList } from "@/db/schema";
import { buildCampaignConfig, buildUnsubscribeUrl } from "@relay/engine";
import { CampaignComposer } from "@relay/engine/ui";
import { notificationTables } from "@/lib/notifications/tables";

export default async function NewCampaignPage() {
  await requireAdmin();
  const [lists, [appRow]] = await Promise.all([
    db
      .select({
        publicId: contactList.publicId,
        name: contactList.name,
        consentSource: contactList.consentSource,
        consentAt: contactList.consentAt,
        memberCount: contactList.memberCount,
      })
      .from(contactList)
      .orderBy(desc(contactList.createdAt)),
    db.select({ timezone: app.timezone }).from(app).limit(1),
  ]);
  const timeZone = appRow?.timezone ?? "America/Toronto";

  const campaignConfig = buildCampaignConfig(notificationTables, process.env, { senderName: "Puchkaman" });
  const footer = campaignConfig
    ? {
        url: buildUnsubscribeUrl(campaignConfig.unsubscribe.baseUrl, campaignConfig.unsubscribe.secret, "preview@example.com"),
        sender: campaignConfig.sender.name,
        address: campaignConfig.sender.postalAddress,
      }
    : undefined;

  return (
    <div className="space-y-6">
      <BackButton href="/dashboard/notifications/campaigns" label="All campaigns" />
      <SectionCard title="New campaign" subtitle="Saved as a draft — nothing sends until you confirm.">
        <CampaignComposer lists={lists} timeZone={timeZone} footer={footer} />
      </SectionCard>
    </div>
  );
}
