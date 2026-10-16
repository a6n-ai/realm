import { Suspense } from "react";
import { zonedDateIso } from "@foundry/commons";
import { CalendarIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService } from "@/lib/services/menu.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { MenuWeekRow, MenuWeekRowsSkeleton } from "./menu-history-card";
import { NewWeekButton } from "./new-week-card";

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
          <SectionCard title="Weeks" subtitle="Open a week to fill it, release it, or change a live menu.">
            <MenuWeekRowsSkeleton />
          </SectionCard>
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

  const [appSettings, weeks] = await Promise.all([
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

  // This week and the next come first; the rest follow newest first, as the service returns them.
  const pinned = [currentId, upcomingId].filter(Boolean) as string[];
  const ordered = [...weeks.filter((w) => pinned.includes(w.publicId)).sort((a, b) => a.weekStart.localeCompare(b.weekStart)), ...weeks.filter((w) => !pinned.includes(w.publicId))];

  return (
    <SectionCard
      title="Weeks"
      subtitle="Open a week to fill it, release it, or change a live menu."
      action={<NewWeekButton takenWeekStarts={weeks.map((w) => w.weekStart)} />}
    >
      {weeks.length === 0 ? (
        <p className="text-muted-foreground text-sm">No menus yet. Use New week to start one.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {ordered.map((w) => (
            <MenuWeekRow key={w.publicId} week={w} highlight={w.publicId === currentId ? "current" : w.publicId === upcomingId ? "upcoming" : null} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
