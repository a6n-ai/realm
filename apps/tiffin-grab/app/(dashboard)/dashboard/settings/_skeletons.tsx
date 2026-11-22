import type { ComponentProps, ReactNode } from "react";
import { Skeleton } from "@foundry/ui/skeleton";
import { PageHeader } from "@/components/ds";

// Settings pages that draw their own header (no layout header) share this frame.
export function SettingsPageFrame({
  icon,
  title,
  subtitle,
  children,
}: Pick<ComponentProps<typeof PageHeader>, "icon" | "title" | "subtitle"> & { children: ReactNode }) {
  return (
    <div aria-busy="true" className="grid gap-6">
      <PageHeader icon={icon} title={title} subtitle={subtitle} />
      {children}
    </div>
  );
}

export function FieldsSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="grid max-w-md gap-3">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="grid gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-24" />
    </div>
  );
}
