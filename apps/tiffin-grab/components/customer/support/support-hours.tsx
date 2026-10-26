import { Clock, Headset } from "lucide-react";
import { IconTile, Pill } from "@/components/customer/kit";
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

  const today = view.week.find((d) => d.today);
  // A Settings-style group: status row, today, the week merged by hours, then the reply time as its footer.
  return (
    <section aria-label="Support hours" className={cn(FONT, "c-surface divide-y divide-[var(--border)] overflow-hidden rounded-3xl bg-[var(--card)]")}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <IconTile tint={view.open ? "green" : "gray"} size="lg"><Headset /></IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-tight font-semibold">{view.open ? "We're open now" : "We're closed now"}</p>
          <p className="text-[13px] text-[var(--muted-foreground,#6E6558)]">{view.detail}</p>
        </div>
        <Pill tone={view.open ? "ok" : "soft"} size="sm">{view.open ? "Open" : "Closed"}</Pill>
      </div>
      {today && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
          <span className="font-semibold">Today</span>
          <span className={cn("tabular-nums", today.open ? "font-semibold" : "text-[var(--muted-foreground,#6E6558)]")}>{today.open ? today.hours : "Closed"}</span>
        </div>
      )}
      <ul aria-label="Weekly hours" className="divide-y divide-[var(--border)]">
        {view.groups.map((g) => (
          <li key={g.days} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
            <span>{g.days}</span>
            <span className={cn("tabular-nums", g.open ? "" : "text-[var(--muted-foreground,#6E6558)]")}>{g.open ? g.hours : "Closed"}</span>
          </li>
        ))}
      </ul>
      {view.reply ? (
        <p className="flex items-center gap-2 px-4 py-3 text-[13px] text-[var(--muted-foreground,#6E6558)]">
          <Clock aria-hidden className="size-4 shrink-0" />
          {view.reply}.
        </p>
      ) : null}
    </section>
  );
}

/** Server slot for pages: renders nothing until staff set the hours. */
export async function SupportHoursSlot({ compact = false }: { compact?: boolean }) {
  const view = await loadSupportHoursView();
  return view ? <SupportHoursNote view={view} compact={compact} /> : null;
}
