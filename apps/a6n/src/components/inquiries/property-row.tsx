import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-2">
      <dt className="py-1.5 text-xs leading-5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 py-1.5 text-sm leading-5">{children ?? "-"}</dd>
    </div>
  );
}

// One card on every width; below lg the header toggles the rows so the activity stays in reach.
export function PropertiesCard({ open = true, onToggle, children }: { open?: boolean; onToggle?: () => void; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <h2 className="flex h-11 items-center justify-between px-4 text-sm font-semibold">
        Properties
        <button type="button" aria-expanded={open} aria-label="Toggle properties" onClick={onToggle} className="-mr-2 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden">
          <ChevronDownIcon aria-hidden className={`size-4 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        </button>
      </h2>
      <dl className={`${open ? "grid" : "hidden"} gap-1 border-t p-4 lg:grid`}>{children}</dl>
    </section>
  );
}
