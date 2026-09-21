import type { ReactNode } from "react";
import { cn, FONT } from "./cn";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  /** Italic saffron word appended to the title. One per screen. */
  accent?: string;
  subtitle?: string;
  /** The single primary action. */
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, accent, subtitle, action, className }: PageHeaderProps) {
  return (
    <header className={cn(FONT, "flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="c-eyebrow mb-2">{eyebrow}</p>}
        <h1 className="c-title-page">
          {title}
          {accent && (
            <>
              {" "}
              <em className="c-accent">{accent}</em>
            </>
          )}
        </h1>
        {subtitle && <p className="c-body mt-2 text-[var(--muted-foreground)]">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
