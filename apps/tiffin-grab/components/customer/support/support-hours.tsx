import { cn, FONT } from "@/components/customer/kit/cn";
import { getAppSettings, getSupportHours } from "@/lib/services/app-settings.service";
import { supportHoursView, type SupportHoursView } from "@/lib/support/support-hours";

/** The customer-facing support hours right now, or null until staff set them. */
export async function loadSupportHoursView(): Promise<SupportHoursView | null> {
  const [{ timezone }, hours] = await Promise.all([getAppSettings(), getSupportHours()]);
  return supportHoursView(hours, timezone);
}

/** Open/closed now, the usual reply time, and (unless compact) the full week behind a disclosure. */
export function SupportHoursNote({ view, compact = false }: { view: SupportHoursView; compact?: boolean }) {
  const line = (
    <p className="flex items-start gap-2 text-[13px] text-[var(--muted-foreground,#6E6558)]">
      <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", view.open ? "bg-[var(--s-delivered-fg)]" : "bg-[var(--border)]")} />
      <span className="text-pretty">
        <span className="font-semibold text-[var(--foreground)]">{view.status}.</span>
        {view.reply ? ` ${view.reply}.` : null}
      </span>
    </p>
  );
  if (compact) return <div className={FONT}>{line}</div>;

  return (
    <details className={cn(FONT, "rounded-2xl border border-[var(--border)] px-4 py-3")}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {line}
        <span className="mt-1 block pl-4 text-[13px] font-semibold underline underline-offset-2">Support hours</span>
      </summary>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pl-4 text-[13px] tabular-nums">
        {view.week.map((r) => (
          <div key={r.day} className={cn("contents", r.today && "font-semibold")}>
            <dt>{r.day}</dt>
            <dd className={cn(r.hours === "Closed" && "text-[var(--muted-foreground,#6E6558)]")}>{r.hours}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Server slot for pages: renders nothing until staff set the hours. */
export async function SupportHoursSlot() {
  const view = await loadSupportHoursView();
  return view ? <SupportHoursNote view={view} /> : null;
}
