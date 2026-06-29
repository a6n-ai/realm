import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

function Chip({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${on ? "border-primary/30 bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>
      <span className={`size-1.5 rounded-full ${on ? "bg-primary" : "bg-muted-foreground/40"}`} />
      {label}
    </span>
  );
}

export function TemplateRow({ event, email, inApp }: { event: string; email: boolean; inApp: boolean }) {
  return (
    <Link href={`/dashboard/settings/notifications/${event}`}
      className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-accent">
      <span className="font-medium">{event}</span>
      <span className="ml-auto flex items-center gap-2">
        <Chip label="Email" on={email} />
        <Chip label="In-app" on={inApp} />
        <ArrowRightIcon className="size-4 text-muted-foreground" />
      </span>
    </Link>
  );
}
