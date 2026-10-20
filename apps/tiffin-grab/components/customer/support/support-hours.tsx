import { Clock, Headset } from "lucide-react";
import { Card, Chip } from "@/components/customer/kit";
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

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            view.open ? "bg-[var(--s-delivered-bg)] text-[var(--s-delivered-fg)]" : "bg-[var(--muted)] text-[var(--muted-foreground,#6E6558)]",
          )}
        >
          <Headset className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[17px] font-semibold leading-tight">{view.open ? "We're open now" : "We're closed now"}</p>
          <p className="text-[14px] text-[var(--muted-foreground,#6E6558)]">{view.detail}</p>
        </div>
      </div>

      {/* Decorative: the same days and hours are in the chips below. */}
      <div aria-hidden className="grid grid-cols-7 gap-1.5">
        {view.week.map((d) => (
          <div key={d.day} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "flex aspect-square w-full max-w-10 items-center justify-center rounded-full text-[13px] font-semibold",
                d.open
                  ? "bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] text-[var(--primary)]"
                  : "border border-dashed border-[var(--border)] text-[var(--muted-foreground,#6E6558)]",
                d.today && "ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--card)]",
              )}
            >
              {d.day[0]}
            </span>
            <span className={cn("text-[10px]", d.today ? "font-semibold text-[var(--primary)]" : "text-transparent")}>Today</span>
          </div>
        ))}
      </div>

      <ul className="flex flex-wrap gap-2">
        {view.groups.map((g) => (
          <li key={g.days}>
            <Chip tone={g.open ? "neutral" : "soft"}>
              <span className="font-semibold">{g.days}</span>
              {g.hours}
            </Chip>
          </li>
        ))}
      </ul>

      {view.reply ? (
        <p className="flex items-start gap-2 border-t border-[var(--border)] pt-3 text-[13px] text-[var(--muted-foreground,#6E6558)]">
          <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
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
