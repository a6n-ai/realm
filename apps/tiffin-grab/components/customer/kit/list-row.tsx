import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn, FONT, FOCUS } from "./cn";

interface ListRowProps {
  label: string;
  sublabel?: string;
  icon?: ReactNode;
  value?: ReactNode;
  /** Renders a link with a chevron. Omit for a static row. */
  href?: string;
  className?: string;
}

const base = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left";

export function ListRow({ label, sublabel, icon, value, href, className }: ListRowProps) {
  const body = (
    <>
      {icon && <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--muted)]">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        {sublabel && <span className="block text-[13px] text-[var(--muted-foreground)]">{sublabel}</span>}
      </span>
      {value && <span className="text-[15px] font-semibold tabular-nums">{value}</span>}
      {href && <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground)]" />}
    </>
  );
  return href ? (
    <Link href={href} className={cn(FONT, FOCUS, base, "rounded-2xl active:bg-[var(--muted)]", className)}>
      {body}
    </Link>
  ) : (
    <div className={cn(FONT, base, className)}>{body}</div>
  );
}

/** Rounded card holding ListRows, hairline dividers between them. */
export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("divide-y divide-[var(--border)] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)]", className)}>
      {children}
    </div>
  );
}
