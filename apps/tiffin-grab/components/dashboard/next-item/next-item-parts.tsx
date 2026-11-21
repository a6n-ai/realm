import type { ReactNode } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { ALL_OWNERS, ME } from "@/lib/list/presets";
import type { OwnerOption } from "./owner-picker";

export type OwnerChoice = OwnerOption;

export function scopeHint(current: string, options: OwnerChoice[]): string {
  if (current === ME) return "Your queue";
  if (current === ALL_OWNERS) return "All owners";
  const name = options.find((o) => o.value === current)?.label;
  return name ? `${name}'s queue` : "Owner's queue";
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
