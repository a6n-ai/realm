import type { ReactNode } from "react";
import { cn, FONT } from "./cn";

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn(FONT, "flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[var(--border)] px-6 py-10 text-center", className)}>
      {icon && <span aria-hidden className="grid size-14 place-items-center rounded-full bg-[var(--primary-wash,#FBE3D2)] text-[var(--primary)]">{icon}</span>}
      <h2 className="c-h2">{title}</h2>
      {body && <p className="c-caption max-w-xs text-[15px]">{body}</p>}
      {action}
    </div>
  );
}
