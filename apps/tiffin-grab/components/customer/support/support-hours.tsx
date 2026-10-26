import { Clock, Headset } from "lucide-react";
import { Card, Chip, IconTile, Pill } from "@/components/customer/kit";
import { cn, FONT } from "@/components/customer/kit/cn";
import { getAppSettings, getSupportHours } from "@/lib/services/app-settings.service";
import { supportHoursView, type SupportHoursView } from "@/lib/support/support-hours";

/** The customer-facing support hours right now, or null until staff set them. */
export async function loadSupportHoursView(): Promise<SupportHoursView | null> {
  const [{ timezone }, hours] = await Promise.all([getAppSettings(), getSupportHours()]);
  return supportHoursView(hours, timezone);
}

/** Open/closed now and the usual reply time; the full card adds the week as a day strip and merged hours. */
export function SupportHoursNote({ view, compact = false }: { view: SupportHoursView; compact?: boolean }) {
  if (compact) {
    return (
      <p className={cn(FONT, "flex items-start gap-2 text-[13px] text-[var(--muted-foreground,#6E6558)]")}>
        <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", view.open ? "bg-[var(--s-delivered-fg)]" : "bg-[var(--border)]")} />
        <span className="text-pretty">
          <span className="font-semibold text-[var(--foreground)]">{view.status}.</span>
          {view.reply ? ` ${view.reply}.` : null}
        </span>
      </p>
    );
  }

  // The week reads like the deliveries calendar: a cell per day, open days tinted, today ringed, closed days muted.
  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <IconTile tint={view.open ? "green" : "gray"} size="lg"><Headset /></IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-tight font-semibold">{view.open ? "We're open now" : "We're closed now"}</p>
          <p className="text-[14px] text-[var(--muted-foreground,#6E6558)]">{view.detail}</p>
        </div>
        <Pill tone={view.open ? "ok" : "soft"} size="sm">{view.open ? "Open" : "Closed"}</Pill>
      </div>

      {/* Decorative: the same days and hours are in the chips below. */}
      <div aria-hidden className="grid grid-cols-7 gap-1">
        {view.week.map((d) => (
          <div key={d.day} className={cn("flex flex-col items-center gap-1 rounded-2xl py-2", d.today && "bg-[var(--primary-wash,#FBE3D2)]")}>
            <span className="text-[11px] font-semibold tracking-wide text-[var(--muted-foreground,#6E6558)] uppercase">{d.day.slice(0, 3)}</span>
            <span
              className={cn(
                "grid size-8 place-items-center rounded-full text-[15px] font-semibold",
                d.open ? "bg-[color-mix(in_oklch,var(--primary)_16%,transparent)] text-[var(--primary)]" : "text-[var(--muted-foreground,#6E6558)] opacity-50",
                d.today && "ring-[1.5px] ring-[var(--primary)]",
              )}
            >
              {d.day[0]}
            </span>
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: d.open ? "var(--s-delivered,#10b981)" : "transparent" }} />
          </div>
        ))}
      </div>

      <ul className="flex flex-wrap gap-2">
        {view.groups.map((g) => (
          <li key={g.days}>
            <Chip tone={g.open ? "neutral" : "soft"}>
              <span className="font-semibold">{g.days}</span>
              {g.open ? g.hours : "Closed"}
            </Chip>
          </li>
        ))}
      </ul>

      {view.reply ? (
        <p className="flex items-center gap-2 text-[13px] text-[var(--muted-foreground,#6E6558)]">
          <Clock aria-hidden className="size-4 shrink-0" />
          {view.reply}.
        </p>
      ) : null}
    </Card>
  );
}

/** Server slot for pages: renders nothing until staff set the hours. */
export async function SupportHoursSlot({ compact = false }: { compact?: boolean }) {
  const view = await loadSupportHoursView();
  return view ? <SupportHoursNote view={view} compact={compact} /> : null;
}
