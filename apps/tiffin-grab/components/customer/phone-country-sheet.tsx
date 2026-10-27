"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { getCountryCallingCode, type Country } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import { Sheet } from "@/components/customer/kit";
import { cn } from "@/components/customer/kit/cn";

type Option = { label: string; value?: Country };

function Flag({ country, name }: { country: Country; name: string }) {
  const F = flags[country];
  return <span className="flex h-4 w-6 shrink-0 overflow-hidden rounded-sm bg-[color-mix(in_srgb,var(--foreground)_15%,transparent)] [&_svg]:size-full">{F ? <F title={name} /> : null}</span>;
}

/**
 * The phone field's country picker as a kit bottom sheet instead of @foundry/ui's popover: a big search field,
 * the picked country pinned first, and rows with the same check every pick in the form uses.
 * Passed to PhoneInput as `countrySelectComponent`, so it gets react-phone-number-input's own props.
 */
export function PhoneCountrySheet({ disabled, value, onChange, options }: {
  disabled?: boolean;
  value: Country;
  onChange: (country: Country) => void;
  options: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const all = useMemo(() => options.filter((o): o is Required<Option> => Boolean(o.value)), [options]);
  const picked = all.find((o) => o.value === value);
  const query = q.trim().toLowerCase().replace(/^\+/, "");
  const shown = useMemo(() => {
    const hits = query
      ? all.filter((o) => o.label.toLowerCase().includes(query) || getCountryCallingCode(o.value).startsWith(query))
      : all;
    return query || !picked ? hits : [picked, ...hits.filter((o) => o.value !== picked.value)];
  }, [all, picked, query]);

  const close = () => {
    setOpen(false);
    setQ("");
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label={`Country: ${picked?.label ?? value}`}
        aria-haspopup="dialog"
        className="flex shrink-0 items-center gap-1.5 pr-1 [-webkit-tap-highlight-color:transparent] disabled:opacity-50"
      >
        {value && <Flag country={value} name={picked?.label ?? value} />}
        <ChevronDown aria-hidden className="size-4 text-[var(--muted-foreground)]" />
      </button>
      <Sheet bottom open={open} onClose={close} title="Country">
        {/* Fixed height: the sheet must not shrink and jump as the search narrows the list. */}
        <div className="min-h-[70dvh]">
        {/* Pinned over the sheet body's 8px top padding too (-top-2/-mt-2/pt-2), so rows never show above it. The fade
            lives in its own bottom padding, so at rest it sits over empty space (the first row stays crisp) and only
            rows scrolled under it fade out. */}
        <div className="sticky -top-2 z-[1] -mx-5 -mt-2 bg-[linear-gradient(to_bottom,var(--card)_calc(100%-1rem),transparent)] px-5 pt-2 pb-4">
          <label className="flex h-12 items-center gap-2 rounded-2xl bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] px-4 focus-within:ring-2 focus-within:ring-[var(--primary)]">
            <Search aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground)]" />
            <span className="sr-only">Search country</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search country or code"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--muted-foreground)]"
            />
          </label>
        </div>
        {shown.length === 0 ? (
          <p className="py-8 text-center text-[15px] text-[var(--muted-foreground)]">No country matches &ldquo;{q.trim()}&rdquo;.</p>
        ) : (
          <ul role="listbox" aria-label="Country" className="c-surface mb-2 divide-y divide-[var(--border)] overflow-hidden rounded-3xl bg-[var(--card)]">
            {shown.map((o) => {
              const on = o.value === value;
              return (
                <li key={o.value} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => { onChange(o.value); close(); }}
                    className={cn("flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-[var(--muted)]", on && "bg-[var(--primary-wash)]")}
                  >
                    <Flag country={o.value} name={o.label} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{o.label}</span>
                    <span className="nums text-[13px] text-[var(--muted-foreground)]">+{getCountryCallingCode(o.value)}</span>
                    <span aria-hidden className={cn("grid size-6 shrink-0 place-items-center rounded-full", on ? "bg-[var(--primary)] text-[var(--primary-foreground,#fff)]" : "invisible")}>
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </Sheet>
    </>
  );
}
