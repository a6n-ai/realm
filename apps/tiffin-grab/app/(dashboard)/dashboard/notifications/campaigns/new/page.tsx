import Link from "next/link";
import { desc } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import { SectionCard } from "@realm/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { contactList } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { CampaignComposer } from "@realm/notifications/ui";

export default async function NewCampaignPage() {
  await requireAdmin();
  const [lists, { timezone }] = await Promise.all([
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
    getAppSettings(),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/notifications/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> All campaigns
      </Link>
      <SectionCard title="New campaign" subtitle="Saved as a draft — nothing sends until you confirm.">
        <CampaignComposer lists={lists} timeZone={timezone} />
      </SectionCard>
    </div>
  );
}
