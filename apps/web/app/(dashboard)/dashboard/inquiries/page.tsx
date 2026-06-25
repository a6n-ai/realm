import { count, eq } from "drizzle-orm";
import { ClipboardListIcon, PlusIcon, InboxIcon, UsersIcon, TrendingUpIcon } from "lucide-react";
import { tzToDefaultCountry } from "@tiffin/commons";
import { db } from "@/db/client";
import { deliveryZones, inquiries, leadSources, leadSubsources } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { parseSort } from "@/lib/list/sort";
import { Button } from "@/components/ui/button";
import { PageShell, PageHeader, SectionCard, StatCard } from "@/components/ds";
import { AddInquirySheet } from "./new-inquiry-form";
import { InquiriesList } from "./inquiries-list";

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireStaff();

  const sort = parseSort(
    await searchParams,
    ["name", "owner", "stage", "source", "lastTouch", "created"],
    { column: "created", dir: "desc" },
  );

  const [{ timezone }, stageCounts, [{ total }], rows, sourceRows, subRows, zones] = await Promise.all([
    getAppSettings(),
    db.select({ stage: inquiries.stage, n: count() }).from(inquiries).groupBy(inquiries.stage),
    db.select({ total: count() }).from(inquiries),
    inquiriesService.listForPipeline(sort),
    db
      .select({ id: leadSources.id, key: leadSources.key, label: leadSources.label, active: leadSources.active })
      .from(leadSources),
    db
      .select({
        sourceId: leadSubsources.sourceId,
        key: leadSubsources.key,
        label: leadSubsources.label,
        active: leadSubsources.active,
      })
      .from(leadSubsources),
    db
      .select({
        name: deliveryZones.name,
        postalPrefixes: deliveryZones.postalPrefixes,
        slotWindow: deliveryZones.slotWindow,
        active: deliveryZones.active,
      })
      .from(deliveryZones)
      .where(eq(deliveryZones.active, true)),
  ]);

  const defaultCountry = tzToDefaultCountry(timezone);

  const sources = sourceRows
    .filter((s) => s.active)
    .map((s) => ({
      key: s.key,
      label: s.label,
      subs: subRows
        .filter((sub) => sub.active && sub.sourceId === s.id)
        .map((sub) => ({ key: sub.key, label: sub.label })),
    }));

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
            sources={sources}
            zones={zones}
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
        <InquiriesList rows={rows} stageCounts={stageCounts} sort={sort} />
      </SectionCard>
    </PageShell>
  );
}
