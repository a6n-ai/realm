import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Breadcrumbs } from "./breadcrumbs";

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  breadcrumbOverrides,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  breadcrumbOverrides?: Record<string, string>;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <Breadcrumbs overrides={breadcrumbOverrides} />
      <div className="flex items-start justify-between gap-4">
        <div className="group flex items-center gap-3">
          <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
            <Icon className="icon-pop size-5" />
          </span>
          <div>
            <h1 className="gradient-text text-2xl font-semibold">{title}</h1>
            {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
