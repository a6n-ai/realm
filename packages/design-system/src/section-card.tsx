import type { ReactNode } from "react";
import { Card, type CardVariant } from "./card";

export function SectionCard({
  title, subtitle, action, children, variant = "glow", titleAs: TitleTag = "h2",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  variant?: CardVariant;
  titleAs?: "h2" | "h3";
}) {
  return (
    <Card variant={variant} className="p-5">
      <div className="flex items-center justify-between">
        <TitleTag className="text-base font-semibold text-balance">{title}</TitleTag>
        {action}
      </div>
      {subtitle && <p className="text-muted-foreground mb-3 text-sm text-pretty">{subtitle}</p>}
      <div className={subtitle ? undefined : "mt-3"}>{children}</div>
    </Card>
  );
}
