"use client";
import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react";
import { SparklesIcon } from "lucide-react";
import { PillToggle } from "@/components/customer/kit";
import { cheaperDropOff, dropOffFee, dropOffSummary, pickInConnection, pickTag, toggleStrategy, type DropOffCatalog, type DropOffOption, type DropOffValue } from "@/lib/catalog/drop-off";

/** Under an address's one-liner: its drop-off and its note, read-only. Nothing when both are empty. */
export function AddressDropOffLines({ catalog, value, note }: { catalog: DropOffCatalog; value: DropOffValue | null | undefined; note: string | null | undefined }) {
  const summary = dropOffSummary(catalog, value);
  return (
    <>
      {summary && <span className="block text-[13px] text-[var(--muted-foreground)]">{summary}</span>}
      {note && <span className="line-clamp-2 block text-[13px] text-[var(--muted-foreground)]">Note: {note}</span>}
    </>
  );
}

/** The picked address's drop-off, attached under its card: it belongs to that address, and is saved back to it. */
export function AddressDropOffPanel({ children }: { children: ReactNode }) {
  return <div className="ml-3 border-l-2 border-[var(--border)] pl-4">{children}</div>;
}

/**
 * Compact one-line pills so several strategies share a row. 32px to the eye; the invisible
 * ::before strip takes the tap target to ~44px so a small pill is still easy to hit.
 */
const PILL =
  "relative h-8 flex-none gap-1.5 whitespace-nowrap px-3 text-[13px] font-medium sm:px-3 sm:text-[13px] before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-['']";

/** Name, then its fee as a quieter tag; a waived fee is struck through with the saving in green. */
function StrategyLabel({ o, on }: { o: DropOffOption; on: boolean }) {
  const fee = dropOffFee(o);
  const green = on ? "text-current" : "text-emerald-700 dark:text-emerald-400";
  return (
    <>
      {/* Real spaces between parts so the accessible name reads "Upstairs +$1.50 Free", not run together. */}
      <span>{o.name}</span>
      {fee && o.waivedPct > 0 ? (
        <>
          {" "}<s className="text-[12px] tabular-nums opacity-60">{fee}</s>
          {" "}<span className={`text-[12px] font-semibold ${green}`}>{o.waivedPct >= 100 ? "Free" : `−${o.waivedPct}%`}</span>
        </>
      ) : fee ? (
        <>{" "}<span className="text-[12px] tabular-nums opacity-70">{fee}</span></>
      ) : null}
    </>
  );
}

/**
 * Under the address: the kind of place (tag) first, then that tag's strategies. Strategies in a
 * connected set are pick-one pills; the rest toggle freely. Everything is optional.
 */
export function DropOffPicker({
  catalog,
  value,
  onChange,
  disabled = false,
  Pill = PillToggle,
}: {
  catalog: DropOffCatalog;
  value: DropOffValue;
  onChange: (value: DropOffValue) => void;
  disabled?: boolean;
  /** The toggle it renders; the admin passes a shadcn one. */
  Pill?: ComponentType<ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }>;
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
            <Pill
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
            </Pill>
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
                <Pill
                  key={o.publicId}
                  role="radio"
                  aria-checked={o.publicId === picked}
                  on={o.publicId === picked}
                  disabled={disabled}
                  // Tapping the pick again clears it: "No preference" without its own button.
                  onClick={() => onChange(pickInConnection(catalog, value, c.publicId, o.publicId === picked ? null : o.publicId))}
                  className={PILL}
                >
                  <StrategyLabel o={o} on={o.publicId === picked} />
                </Pill>
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
              <Pill
                key={o.publicId}
                on={value.strategyIds.includes(o.publicId)}
                disabled={disabled}
                onClick={() => onChange(toggleStrategy(catalog, value, o.publicId))}
                className={PILL}
              >
                <StrategyLabel o={o} on={value.strategyIds.includes(o.publicId)} />
              </Pill>
            ))}
          </div>
        </div>
      )}

      <DropOffTips catalog={catalog} value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/** Live delivery offers, and a nudge when the same set has a cheaper drop-off than the one picked. */
function DropOffTips({ catalog, value, onChange, disabled }: { catalog: DropOffCatalog; value: DropOffValue; onChange: (value: DropOffValue) => void; disabled: boolean }) {
  const cheaper = cheaperDropOff(catalog, value);
  if (catalog.offers.length === 0 && !cheaper) return null;
  return (
    <div className="grid gap-2">
      {catalog.offers.map((offer) => (
        <p key={offer.name} className="flex items-center gap-2 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[13px] text-pretty">
          <SparklesIcon aria-hidden className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{offer.name}</span>
            <span className="text-[var(--muted-foreground)]"> · {offer.percent >= 100 ? "delivery fees waived" : `${offer.percent}% off delivery fees`}</span>
          </span>
        </p>
      ))}
      {cheaper && (
        <div className="flex items-center gap-2 rounded-2xl border-2 border-[var(--primary)]/30 bg-[var(--primary)]/10 py-1.5 pr-1.5 pl-3">
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-pretty">
            <span className="font-semibold">{cheaper.alt.name}</span>
            <span className="text-[var(--muted-foreground)]"> saves ${cheaper.saves.toFixed(2)}{cheaper.perDelivery ? " per delivery" : ""} on {cheaper.picked.name}</span>
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(pickInConnection(catalog, value, cheaper.picked.connectionId!, cheaper.alt.publicId))}
            className="relative h-8 shrink-0 cursor-pointer rounded-full bg-[var(--primary)] px-3.5 text-[13px] font-semibold text-[var(--primary-foreground,#fff)] transition-transform duration-100 before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] active:scale-[0.97] disabled:opacity-40 motion-reduce:active:scale-100"
          >
            Switch
          </button>
        </div>
      )}
    </div>
  );
}
