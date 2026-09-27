"use client";
import { PillToggle } from "@/components/customer/kit";
import { dropOffLabel, pickInConnection, pickTag, toggleStrategy, type DropOffCatalog, type DropOffValue } from "@/lib/catalog/drop-off";

/** Small pills: several strategies fit on one line instead of a stack of full-width buttons. */
const PILL = "h-8 flex-none px-3 text-[13px] sm:px-3 sm:text-[13px]";

/**
 * Under the address: the kind of place (tag) first, then that tag's strategies. Strategies in a
 * connected set are pick-one pills; the rest toggle freely. Everything is optional.
 */
export function DropOffPicker({
  catalog,
  value,
  onChange,
  disabled = false,
}: {
  catalog: DropOffCatalog;
  value: DropOffValue;
  onChange: (value: DropOffValue) => void;
  disabled?: boolean;
}) {
  const tags = catalog.groups.filter((g) => catalog.options.some((o) => o.groupId === g.publicId));
  if (tags.length === 0) return null;
  const tag = tags.find((g) => g.publicId === value.tagId);
  const options = tag ? catalog.options.filter((o) => o.groupId === tag.publicId) : [];
  const sets = tag ? catalog.connections.filter((c) => c.groupId === tag.publicId && options.some((o) => o.connectionId === c.publicId)) : [];
  const loose = options.filter((o) => !o.connectionId || !sets.some((c) => c.publicId === o.connectionId));

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-[15px] font-semibold">Place</p>
        <div role="radiogroup" aria-label="Place" className="flex flex-wrap gap-2">
          {tags.map((g) => (
            <PillToggle
              key={g.publicId}
              role="radio"
              aria-checked={g.publicId === value.tagId}
              on={g.publicId === value.tagId}
              disabled={disabled}
              // Tapping the picked place again clears it: every choice here is optional.
              onClick={() => onChange(pickTag(value, g.publicId === value.tagId ? null : g.publicId))}
              className="h-10 flex-none px-4 text-[14px] sm:text-[14px]"
            >
              {g.name}
            </PillToggle>
          ))}
        </div>
        {tag?.description && <p className="text-[13px] text-[var(--muted-foreground)]">{tag.description}</p>}
      </div>

      {sets.map((c) => {
        const picked = options.find((o) => o.connectionId === c.publicId && value.strategyIds.includes(o.publicId))?.publicId ?? null;
        return (
          <div key={c.publicId} className="grid gap-2">
            {/* Sets are made by connecting strategies in admin, so they have no name to show. */}
            <p className="text-[15px] font-semibold">{c.name || "Choose one"}</p>
            <div role="radiogroup" aria-label={c.name || "Choose one"} className="flex flex-wrap gap-1.5">
              {options.filter((o) => o.connectionId === c.publicId).map((o) => (
                <PillToggle
                  key={o.publicId}
                  role="radio"
                  aria-checked={o.publicId === picked}
                  on={o.publicId === picked}
                  disabled={disabled}
                  // Tapping the pick again clears it: "No preference" without its own button.
                  onClick={() => onChange(pickInConnection(catalog, value, c.publicId, o.publicId === picked ? null : o.publicId))}
                  className={PILL}
                >
                  {dropOffLabel(o)}
                </PillToggle>
              ))}
            </div>
          </div>
        );
      })}

      {loose.length > 0 && (
        <div className="grid gap-2">
          {sets.length > 0 && <p className="text-[15px] font-semibold">Also</p>}
          <div className="flex flex-wrap gap-1.5">
            {loose.map((o) => (
              <PillToggle
                key={o.publicId}
                on={value.strategyIds.includes(o.publicId)}
                disabled={disabled}
                onClick={() => onChange(toggleStrategy(catalog, value, o.publicId))}
                className={PILL}
              >
                {dropOffLabel(o)}
              </PillToggle>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
