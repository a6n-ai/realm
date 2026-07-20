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
      {/* Heading + subheading as one header block; action aligns to the title row on desktop. */}
      <header className="mb-3 flex items-start justify-between gap-3 md:mb-4">
        <div className="min-w-0 space-y-0.5 md:space-y-1">
          <TitleTag className="text-base font-semibold tracking-tight text-balance md:text-lg">
            {title}
          </TitleTag>
          {subtitle ? (
            <p className="text-muted-foreground text-sm text-pretty md:max-w-prose">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
      </header>
      {children}
    </Card>
  );
}
