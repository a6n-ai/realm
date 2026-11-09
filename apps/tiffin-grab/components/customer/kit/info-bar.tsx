import type { ReactNode } from "react";
import { cn, FONT } from "./cn";

// iOS system colours (as on IconTile), here on the glyph itself: no box, the colour says what kind of notice it is.
const TINT = { blue: "text-[#007AFF]", green: "text-[#34C759]", orange: "text-[#FF9500]", red: "text-[#FF3B30]", gray: "text-muted-foreground" } as const;

/** One-line notice above a flow's steps (an offer, "Delivering to Milton"): glass, 44px tall, a coloured icon, text, one action. */
export function InfoBar({ icon, tint = "gray", action, className, children, role }: { icon?: ReactNode; tint?: keyof typeof TINT; action?: ReactNode; className?: string; children: ReactNode; role?: "status" }) {
  return (
    <div role={role} className={cn(FONT, "c-glass-card c-info-bar", className)}>
      {icon ? <span aria-hidden className={cn("grid shrink-0 place-items-center [&_svg]:size-5", TINT[tint])}>{icon}</span> : null}
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
    </div>
  );
}
