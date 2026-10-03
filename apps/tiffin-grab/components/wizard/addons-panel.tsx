import { PlusIcon } from "lucide-react";
import type { CatalogAddon } from "@/lib/catalog/types";
import { Button, Stepper } from "@/components/customer/kit";
import type { WizardSelections } from "./selections";

/**
 * The add-on picker: inline under the picked meal on desktop, inside the
 * "Add to every tiffin?" drawer on phones. `bare` drops the card chrome for the drawer,
 * which already has its own title.
 */
export function AddonsPanel({
  addons,
  selections,
  set,
  bare = false,
  className = "",
}: {
  addons: CatalogAddon[];
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

  const list = (
    <ul className={bare ? "space-y-2" : "mt-3 space-y-2"}>
      {addons.map((addon) => {
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

  if (bare) return <section aria-label="Add-ons" className={className}>{list}</section>;
  return (
    <section aria-label="Add-ons" className={`bg-card border-border rounded-2xl border p-4 ${className}`}>
      <h4 className="text-[15px] font-semibold tracking-[-0.01em]">Add to every tiffin</h4>
      <p className="text-muted-foreground mt-0.5 text-[13px]">Optional extras, billed per tiffin.</p>
      {list}
    </section>
  );
}
