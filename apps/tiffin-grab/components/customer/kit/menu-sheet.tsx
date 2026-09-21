import type { ReactNode } from "react";
import { cn, FONT } from "./cn";

/** Content primitive for the Menu sheet: an eyebrow-labelled group of ListRows. */
export function MenuSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn(FONT, "py-2", className)}>
      <h3 className="c-label mb-2 px-1 uppercase tracking-[0.15em]">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}
