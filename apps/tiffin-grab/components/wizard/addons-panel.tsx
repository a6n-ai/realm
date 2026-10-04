import { ChevronDownIcon, PlusIcon } from "lucide-react";
import type { CatalogAddon } from "@/lib/catalog/types";
import { Button, Stepper } from "@/components/customer/kit";
import type { WizardSelections } from "./selections";

/**
 * The add-on picker: inline under the picked meal on desktop, inside the
 * "Add to every tiffin?" drawer on phones. `bare` drops the card chrome for the drawer,
 * which already has its own title. One collapsible section per dish category; a
 * section opens on its own when it already holds a pick, or when it is the only one.
 */
export function AddonsPanel({
  addons,
  categoryLabels,
  selections,
  set,
  bare = false,
  className = "",
}: {
  addons: CatalogAddon[];
  categoryLabels?: Record<string, string>;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
  bare?: boolean;
  className?: string;
}) {
  const picked = selections.addonSelections ?? [];
  const qtyFor = (key: string) => picked.find((s) => s.key === key)?.qty ?? 0;
  const setQty = (key: string, qty: number) => {
    const rest = picked.filter((s) => s.key !== key);
    set({ addonSelections: qty > 0 ? [...rest, { key, qty }] : rest });
  };

  const groups = new Map<string, CatalogAddon[]>();
  for (const a of addons) groups.set(a.category, [...(groups.get(a.category) ?? []), a]);

  const rows = (items: CatalogAddon[]) => (
    <ul className="space-y-2 pt-2">
      {items.map((addon) => {
        const qty = qtyFor(addon.key);
        const active = qty > 0;
        return (
          <li
            key={addon.key}
            className={`border-border flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-2 transition-colors ${active ? "border-primary/40 bg-primary/10" : ""}`}
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-[15px] font-medium">
                {addon.name}
                {addon.portion ? <span className="text-muted-foreground font-normal"> · {addon.portion}</span> : null}
              </span>
              <span className="nums text-muted-foreground text-[13px]">+${addon.pricePerTiffin.toFixed(2)} per tiffin</span>
            </div>
            {active ? (
              <Stepper label={addon.name} value={qty} min={0} max={addon.maxQty} onChange={(n) => setQty(addon.key, n)} />
            ) : (
              <Button variant="quiet" pill className="min-h-11 shrink-0 gap-1 !px-4 text-sm font-medium" aria-label={`Add ${addon.name}`} onClick={() => setQty(addon.key, 1)}>
                <PlusIcon aria-hidden className="size-4" /> Add
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );

  const list = (
    <div className={bare ? "space-y-2" : "mt-3 space-y-2"}>
      {[...groups].map(([category, items]) => {
        const count = items.reduce((n, a) => n + qtyFor(a.key), 0);
        const total = items.reduce((sum, a) => sum + qtyFor(a.key) * a.pricePerTiffin, 0);
        return (
          <details key={category} open={count > 0 || groups.size === 1} className="group">
            <summary className="border-border flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border px-4 [&::-webkit-details-marker]:hidden">
              <span className="text-[15px] font-semibold">{categoryLabels?.[category] ?? category}</span>
              <span className="text-muted-foreground flex items-center gap-2 text-[13px]">
                {count > 0 ? <span className="nums text-primary font-medium">{count} added · +${total.toFixed(2)}/tiffin</span> : `${items.length} option${items.length === 1 ? "" : "s"}`}
                <ChevronDownIcon aria-hidden className="size-4 transition-transform group-open:rotate-180" />
              </span>
            </summary>
            {rows(items)}
          </details>
        );
      })}
    </div>
  );

  if (bare) return <section aria-label="Add-ons" className={className}>{list}</section>;
  return (
    <section aria-label="Add-ons" className={`bg-card border-border rounded-2xl border p-4 ${className}`}>
      <h4 className="text-[15px] font-semibold tracking-[-0.01em]">Add to every tiffin</h4>
      <p className="text-muted-foreground mt-0.5 text-[13px]">Optional extras, billed per tiffin.</p>
      {list}
    </section>
  );
}
