import { CakeSlice, ChevronDownIcon, CupSoda, Leaf, PlusIcon, Salad, Soup, UtensilsCrossed, Wheat, type LucideIcon } from "lucide-react";
import type { CatalogAddon } from "@/lib/catalog/types";
import { IconTile, Stepper, type IconTint } from "@/components/customer/kit";
import type { WizardSelections } from "./selections";

// Each dish category gets its own Settings-style tile; anything unknown takes the next unused colour.
const CATEGORY: Record<string, { icon: LucideIcon; tint: IconTint }> = {
  salad: { icon: Salad, tint: "green" },
  raita: { icon: Soup, tint: "cyan" },
  daal: { icon: Soup, tint: "orange" },
  curry: { icon: Soup, tint: "red" },
  sabzi: { icon: Leaf, tint: "mint" },
  roti: { icon: Wheat, tint: "brown" },
  rice: { icon: Wheat, tint: "yellow" },
  dessert: { icon: CakeSlice, tint: "pink" },
  sweet: { icon: CakeSlice, tint: "pink" },
  drink: { icon: CupSoda, tint: "blue" },
  beverage: { icon: CupSoda, tint: "blue" },
};
const SPARE: IconTint[] = ["purple", "indigo", "teal", "gray"];

/**
 * The add-on picker: inline under the picked meal on desktop, inside the "Add to every tiffin?" drawer on
 * phones (`bare` drops the card chrome, the drawer has its own title). iOS Settings style: one grouped
 * section per dish category with its own tile, rows on hairlines, a round add button that becomes the
 * quantity stepper, and a glass running total pinned at the top. A section opens on its own when it
 * already holds a pick, or when it is the only one.
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
  let spare = 0;
  const look = (category: string) => CATEGORY[category.toLowerCase()] ?? { icon: UtensilsCrossed, tint: SPARE[spare++ % SPARE.length]! };
  const addedCount = addons.reduce((n, a) => n + qtyFor(a.key), 0);
  const addedPerTiffin = addons.reduce((sum, a) => sum + qtyFor(a.key) * a.pricePerTiffin, 0);

  const rows = (items: CatalogAddon[]) => (
    <ul className="divide-y divide-[var(--border)]">
      {items.map((addon) => {
        const qty = qtyFor(addon.key);
        const active = qty > 0;
        return (
          <li key={addon.key} className={`flex min-h-14 items-center justify-between gap-3 px-4 py-2 transition-colors ${active ? "bg-[var(--primary-wash)]" : ""}`}>
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
              <button
                type="button"
                aria-label={`Add ${addon.name}`}
                onClick={() => setQty(addon.key, 1)}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground,#fff)] transition-transform active:scale-95 motion-reduce:transform-none"
              >
                <PlusIcon aria-hidden className="size-5" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );

  const list = (
    <div className={bare ? "space-y-3" : "mt-3 space-y-3"}>
      {/* The running total rides at the top of the drawer as a glass capsule, so it stays in view while you scroll. */}
      {bare && addedCount > 0 && (
        <p role="status" className="c-liquid sticky top-0 z-[1] mx-auto w-fit rounded-full border px-4 py-1.5 text-[13px] font-semibold tabular-nums">
          {addedCount} add-on{addedCount === 1 ? "" : "s"} · +${addedPerTiffin.toFixed(2)} per tiffin
        </p>
      )}
      {[...groups].map(([category, items]) => {
        const count = items.reduce((n, a) => n + qtyFor(a.key), 0);
        const total = items.reduce((sum, a) => sum + qtyFor(a.key) * a.pricePerTiffin, 0);
        const { icon: Icon, tint } = look(category);
        return (
          <details key={category} open={count > 0 || groups.size === 1} className="group c-surface overflow-hidden rounded-3xl bg-[var(--card)]">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
              <IconTile tint={tint}><Icon /></IconTile>
              <span className="min-w-0 flex-1 text-[15px] font-semibold">{categoryLabels?.[category] ?? category}</span>
              <span className="text-muted-foreground flex items-center gap-2 text-[13px]">
                {count > 0 ? <span className="nums text-primary font-medium">{count} added · +${total.toFixed(2)}/tiffin</span> : `${items.length} option${items.length === 1 ? "" : "s"}`}
                <ChevronDownIcon aria-hidden className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </span>
            </summary>
            <div className="border-t border-[var(--border)]">{rows(items)}</div>
          </details>
        );
      })}
    </div>
  );

  if (bare) return <section aria-label="Add-ons" className={className}>{list}</section>;
  return (
    <section aria-label="Add-ons" className={`c-surface bg-card rounded-3xl p-4 ${className}`}>
      <h4 className="text-[15px] font-semibold tracking-[-0.01em]">Add to every tiffin</h4>
      <p className="text-muted-foreground mt-0.5 text-[13px]">Optional extras, billed per tiffin.</p>
      {list}
    </section>
  );
}
