import { count, desc } from "drizzle-orm";
import { ClipboardListIcon, PlusIcon, InboxIcon, UsersIcon, TrendingUpIcon } from "lucide-react";
import { tzToDefaultCountry } from "@tiffin/commons";
import { db } from "@/db/client";
import { inquiries } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { Button } from "@/components/ui/button";
import { PageShell, PageHeader, SectionCard, StatCard } from "@/components/ds";
import { AddInquirySheet } from "./new-inquiry-form";
import { InquiriesList } from "./inquiries-list";

export default async function InquiriesPage() {
  await requireStaff();

  const [{ timezone }, stageCounts, [{ total }], rows] = await Promise.all([
    getAppSettings(),
    db.select({ stage: inquiries.stage, n: count() }).from(inquiries).groupBy(inquiries.stage),
    db.select({ total: count() }).from(inquiries),
    db.select().from(inquiries).orderBy(desc(inquiries.createdAt)).limit(500),
  ]);

  const defaultCountry = tzToDefaultCountry(timezone);

  const countOf = (...stages: string[]) =>
    stageCounts.filter((r) => stages.includes(r.stage)).reduce((sum, r) => sum + r.n, 0);

  const open = countOf("new", "contacted", "follow_up");
  const converted = countOf("converted");
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

  return (
    <PageShell>
      <PageHeader
        icon={ClipboardListIcon}
        title="Inquiries"
        subtitle={`${total} total · ${open} open`}
        actions={
          <AddInquirySheet
            defaultCountry={defaultCountry}
            trigger={
              <Button>
                <PlusIcon className="size-4" />
                New inquiry
              </Button>
            }
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={InboxIcon} label="Total" value={total} hint="all inquiries" />
        <StatCard icon={UsersIcon} label="Open" value={open} hint="new · contacted · follow-up" />
        <StatCard
          icon={TrendingUpIcon}
          label="Converted"
          value={converted}
          hint={`${conversionRate}% conversion`}
        />
      </div>

      <SectionCard title="All inquiries" subtitle={total === 0 ? "Nothing yet" : undefined}>
        <InquiriesList rows={rows} stageCounts={stageCounts} />
      </SectionCard>
    </PageShell>
  );
}
