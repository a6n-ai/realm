import type { ReactNode } from "react";
import { Card } from "./card";

export function SectionCard({
  title, subtitle, action, children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {subtitle && <p className="text-muted-foreground mb-3 text-sm">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-3"}>{children}</div>
    </Card>
  );
}
