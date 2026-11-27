import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Vercel's empty state: an icon in a rounded tile, a bold title, a muted line and, when there is something to do, the action.
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl border bg-muted">
        <Icon className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-semibold">{title}</p>
        {description ? <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
