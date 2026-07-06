import type { ReactNode } from "react";
import { cn } from "@realm/ui/cn";
import { Card, type CardVariant } from "./card";

export function SectionCard({
  title, subtitle, action, children, variant = "glow", titleAs: TitleTag = "h2", bleed = false,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  variant?: CardVariant;
  titleAs?: "h2" | "h3";
  bleed?: boolean;
}) {
  return (
    <Card variant={variant} className={cn("p-5", bleed && "max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none")}>
      <div className="flex items-center justify-between">
        <TitleTag className="text-base font-semibold text-balance">{title}</TitleTag>
        {action}
      </div>
      {subtitle && <p className="text-muted-foreground mb-3 text-sm text-pretty">{subtitle}</p>}
      <div className={subtitle ? undefined : "mt-3"}>{children}</div>
    </Card>
  );
}
