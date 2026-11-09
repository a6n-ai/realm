import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { Card } from "@/components/ds";
import { IconTileSkeleton } from "./icon-tile";

/** A System Settings–style group: a small label over one card of rows. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = `settings-group-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section className="mb-6 flex break-inside-avoid flex-col gap-2 last:mb-0" aria-labelledby={id}>
      <h2 id={id} className="text-muted-foreground px-1 text-xs font-medium">
        {title}
      </h2>
      <Card variant="flat" className="overflow-hidden p-0">
        <ul className="divide-border divide-y">{children}</ul>
      </Card>
    </section>
  );
}

/** One navigable row: tile, label, one-line description, optional trailing status, chevron. */
export function SettingsRow({
  href,
  tile,
  label,
  description,
  trailing,
  emphasis = false,
}: {
  href: string;
  tile: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  /** An action row (e.g. "Add payment method") reads in the primary color. */
  emphasis?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        prefetch={false}
        className="hover:bg-accent focus-visible:bg-accent flex items-center gap-3 px-4 py-3 transition-colors outline-none"
      >
        {tile}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={emphasis ? "text-primary text-sm font-medium" : "text-sm font-medium"}>{label}</span>
          {description ? <span className="text-muted-foreground truncate text-xs">{description}</span> : null}
        </span>
        {trailing}
        <ChevronRightIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
      </Link>
    </li>
  );
}

/** Two balanced columns on wide screens; groups differ in length, so columns, not a grid. */
export function SettingsColumns({ children }: { children: ReactNode }) {
  return <div className="gap-6 lg:columns-2">{children}</div>;
}

export function SettingsGroupSkeleton({ rows }: { rows: number }) {
  return (
    <div className="mb-6 flex break-inside-avoid flex-col gap-2 last:mb-0">
      <Skeleton className="mx-1 h-3.5 w-20" />
      <Card variant="flat" className="overflow-hidden p-0">
        <ul className="divide-border divide-y">
          {Array.from({ length: rows }, (_, r) => (
            <li key={r} className="flex items-center gap-3 px-4 py-3">
              <IconTileSkeleton />
              <span className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-48 max-w-full" />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
