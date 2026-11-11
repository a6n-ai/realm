import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon, type LucideIcon } from "lucide-react";
import { SectionCard } from "@/components/ds";
import { ALL_OWNERS, ME } from "@/lib/list/presets";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { OwnerPicker, type OwnerOption } from "./owner-picker";

export type OwnerChoice = OwnerOption;
export type NextItemFact = [label: string, value: string | null];

/** One Next card's content; the shell lays it out in the same regions for lead, renewal and order. */
export type NextItemView = {
  /** Avatar, name, status and badges, with the icon-only secondary actions on the same row. */
  identity: ReactNode;
  meta?: ReactNode;
  facts: NextItemFact[];
  note?: ReactNode;
  /** The card's one labelled primary action. */
  primary: ReactNode;
  upNext?: ReactNode;
};

export type NextItemCardProps = {
  title: string;
  /** Lower-case noun for the queue arrows' aria labels, e.g. "lead". */
  noun: string;
  owner: { current: string; options: OwnerChoice[] };
  dueText: string;
  prevHref?: string;
  nextHref?: string;
  item: NextItemView | null;
  empty: ReactNode;
};

export function scopeHint(current: string, options: OwnerChoice[]): string {
  if (current === ME) return "Your queue";
  if (current === ALL_OWNERS) return "All owners";
  const name = options.find((o) => o.value === current)?.label;
  return name ? `${name}'s queue` : "Owner's queue";
}

function QueueArrow({ label, href, icon: Icon }: { label: string; href?: string; icon: LucideIcon }) {
  if (!href) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label={label} disabled>
        <Icon className="size-4" />
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} asChild>
      <Link href={href} prefetch={false}>
        <Icon className="size-4" />
      </Link>
    </Button>
  );
}

export function NextItemCard({ title, noun, owner, dueText, prevHref, nextHref, item, empty }: NextItemCardProps) {
  const label = owner.options.find((o) => o.value === owner.current)?.label ?? "Me";
  const facts = item?.facts.filter((f): f is [string, string] => f[1] != null && f[1] !== "") ?? [];
  const action = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs">{scopeHint(owner.current, owner.options)}</span>
      <OwnerPicker label={label} options={owner.options} />
      {item ? (
        <div className="flex items-center gap-1">
          <QueueArrow label={`Previous ${noun}`} href={prevHref} icon={ChevronLeftIcon} />
          <span className="text-muted-foreground px-1 text-xs tabular-nums">{dueText}</span>
          <QueueArrow label={`Next ${noun}`} href={nextHref} icon={ChevronRightIcon} />
        </div>
      ) : null}
    </div>
  );
  return (
    <SectionCard title={title} action={action}>
      {item ? (
        <>
          <div className="flex flex-col gap-4">
            {item.identity}
            {item.meta}
            {facts.length ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-5">
                {facts.map(([k, v]) => (
                  <div key={k} className="flex min-w-0 flex-col">
                    <dt className="text-muted-foreground text-xs">{k}</dt>
                    <dd className="truncate text-sm font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {item.note}
            <div className="flex flex-wrap items-center gap-2">
              {item.primary}
              {nextHref ? (
                <Button variant="ghost" size="sm" className="ml-auto" asChild>
                  <Link href={nextHref} prefetch={false}>Skip</Link>
                </Button>
              ) : null}
            </div>
          </div>
          {item.upNext}
        </>
      ) : (
        empty
      )}
    </SectionCard>
  );
}

/** Empty queue: the title and detail say why; the children are its links. */
export function NextItemEmpty({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
          <CheckCircle2Icon className="text-muted-foreground size-5" />
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">{title}</p>
          {detail ? <p className="text-muted-foreground text-xs tabular-nums">{detail}</p> : null}
        </div>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** Same regions as a loaded card, so the page does not jump when data arrives. */
export function NextItemSkeleton({ title }: { title: string }) {
  return (
    <SectionCard title={title} action={<Skeleton className="h-8 w-40" />}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-3 w-56" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col gap-1">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="mt-3 flex flex-col gap-2 border-t pt-3 md:flex-row md:gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full shrink-0 md:w-64" />
        ))}
      </div>
    </SectionCard>
  );
}
