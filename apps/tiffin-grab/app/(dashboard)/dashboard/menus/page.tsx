import { Suspense } from "react";
import { zonedDateIso } from "@foundry/commons";
import { CalendarIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService } from "@/lib/services/menu.service";
import { getAppSettings, getMealTypes } from "@/lib/services/app-settings.service";
import { isoToDayOfWeek } from "@/lib/menu/poster";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { MenuHistoryCard, MenuHistoryCardSkeleton } from "./menu-history-card";
import { NewWeekCard } from "./new-week-card";

/**
 * Index only: pick a week, or start one. Building a week happens at
 * /dashboard/menus/[week] — the grid needs the full width, and a chooser and a workspace
 * are two different jobs that were fighting for the same screen.
 */
export default function MenusPage() {
  return (
    <PageShell>
      <PageHeader
        icon={CalendarIcon}
        title="Weekly Menus"
        subtitle="Monday-to-Sunday kitchen boards. Start a week, then fill and release it."
      />
      <Suspense
        fallback={
          <>
            <SectionCard title="New week">
              <div className="h-16" />
            </SectionCard>
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <MenuHistoryCardSkeleton key={i} />
              ))}
            </div>
          </>
        }
      >
        <MenusData />
      </Suspense>
    </PageShell>
  );
}

/**
 * Reading the clock is per-request server state, not render state. react-hooks/purity
 * cannot tell the difference, and this route is dynamic (requireAdmin reads headers), so
 * it renders once per request and "which week is current" is genuinely a function of now.
 */
function todayIn(timezone: string): string {
  return zonedDateIso(Date.now(), timezone);
}

async function MenusData() {
  await requireAdmin();

  const [mealTypes, appSettings, weeks] = await Promise.all([
    getMealTypes(),
    getAppSettings(),
    menuService.listWeekMenus(),
  ]);

  const today = todayIn(appSettings.timezone);
  const addDaysIso = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const currentId = weeks.find((w) => w.weekStart <= today && today <= addDaysIso(w.weekStart, 6))?.publicId;
  const futureStarts = weeks.filter((w) => w.weekStart > today).map((w) => w.weekStart).sort();
  const upcomingId = futureStarts.length ? weeks.find((w) => w.weekStart === futureStarts[0])?.publicId : undefined;

  return (
    <>
      <SectionCard title="New week" subtitle="Weeks start on Monday. Dates that already have a menu are skipped.">
        <NewWeekCard takenWeekStarts={weeks.map((w) => w.weekStart)} />
      </SectionCard>

      {weeks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No menus yet — pick a Monday above to start one.</p>
      ) : (
        <div className="space-y-4">
          {weeks.map((w) => (
            <MenuHistoryCard
              key={w.publicId}
              week={w}
              accent={mealTypes.tiffin.accent}
              highlight={w.publicId === currentId ? "current" : w.publicId === upcomingId ? "upcoming" : null}
              todayKey={w.publicId === currentId ? isoToDayOfWeek(today) : undefined}
            />
          ))}
        </div>
      )}
    </>
  );
}
