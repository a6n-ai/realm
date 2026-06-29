import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

/** "order_activated" → "Order activated" for human-readable labels. */
export function eventLabel(event: string): string {
  return event.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function Chip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`inline-flex min-w-[4.75rem] items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
        on ? "border-primary/30 bg-primary/10 text-foreground" : "border-border text-muted-foreground"
      }`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${on ? "bg-primary" : "bg-muted-foreground/40"}`} />
      {label}
    </span>
  );
}

export function TemplateRow({ event, email, inApp }: { event: string; email: boolean; inApp: boolean }) {
  return (
    <Link
      href={`/dashboard/notifications/templates/${event}`}
      className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="font-medium">{eventLabel(event)}</span>
      <span className="flex items-center gap-2">
        <Chip label="Email" on={email} />
        <Chip label="In-app" on={inApp} />
        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
