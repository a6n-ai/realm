import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheckIcon, CalendarOffIcon, CircleSlashIcon, HourglassIcon, UsersIcon } from "lucide-react";
import { NotFoundError, zonedDateIso } from "@foundry/commons";
import { formatEpoch } from "@/lib/format/datetime";
import { PageShell, PageHeader, SectionCard, StatGrid, TonePill } from "@/components/ds";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { humanDate } from "@/lib/deliveries-view";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getHolidayDetail, listNeedsPlacing } from "@/lib/services/holidays.service";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { ClosedDaysTable, NeedsPlacingTable } from "../holidays-table";

export default async function HolidayPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ holiday: ["read"] });
  const { id } = await params;
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  const [{ timezone }, waiting] = await Promise.all([getAppSettings(), listNeedsPlacing(visible)]);
  let detail;
  try {
    detail = await getHolidayDetail(id, visible);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { holiday, rows, stats } = detail;
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const today = zonedDateIso(Date.now(), timezone);
  const when = holiday.date > today ? "Upcoming" : holiday.date === today ? "Today" : "Past";
  const mine = waiting.filter((w) => w.holidayPublicId === holiday.publicId);

  return (
    <PageShell>
      <PageHeader
        icon={CalendarOffIcon}
        title={`${holiday.name} · ${humanDate(holiday.date)}`}
        subtitle={[
          holiday.organizationName,
          holiday.declaredBy ? `declared by ${holiday.declaredBy}` : "recorded by staff",
          holiday.notifiedAt ? `customers notified ${formatEpoch(holiday.notifiedAt, { mode: "date", timeZone: timezone })}` : "customers not notified",
        ].join(" · ")}
        actions={<div className="flex items-center gap-2"><TonePill tone={when === "Past" ? "neutral" : "brand"}>{when}</TonePill><Link className="text-sm hover:underline" href="/dashboard/holidays">All holidays</Link></div>}
      />
      <StatGrid
        cols={4}
        items={[
          { label: "Closed", value: stats.closed, icon: CalendarOffIcon, hint: `${stats.customers} ${stats.customers === 1 ? "customer" : "customers"}` },
          { label: "Placed", value: stats.placed, icon: CalendarCheckIcon, hint: "on another day" },
          { label: "Needs placing", value: stats.needsPlacing, icon: HourglassIcon, tone: stats.needsPlacing > 0 ? "bad" : "ok" },
          { label: "Dismissed", value: stats.dismissed, icon: CircleSlashIcon },
        ]}
      />
      <SectionCard title="What needs doing">
        {mine.length > 0 ? (
          <>
            <p className="text-muted-foreground mb-3 text-sm">
              These closed days have no other day yet. Place each one, or dismiss it if it should not be made up.
            </p>
            <NeedsPlacingTable rows={mine} today={today} />
          </>
        ) : (
          <p className="text-muted-foreground flex items-center gap-2 text-sm"><CalendarCheckIcon className="size-4" /> All placed. Nothing left to do for this holiday.</p>
        )}
      </SectionCard>
      <SectionCard title="Closed deliveries">
        <p className="text-muted-foreground mb-3 flex items-center gap-2 text-sm"><UsersIcon className="size-4" /> Every delivery this holiday closed, and where its tiffin went.</p>
        <ClosedDaysTable rows={rows} />
      </SectionCard>
    </PageShell>
  );
}
