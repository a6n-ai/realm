"use client";

import { AddressFields as FoundryAddressFields, type AddressFieldsProps as FoundryProps, type AddressUi } from "@foundry/ui/address-fields";
import { Field, Select } from "@/components/customer/kit";
import { cn, FONT } from "@/components/customer/kit/cn";

export { deriveSuggestUrl } from "@foundry/ui/address-fields";
export type { ResolvedPlaceFields as ResolvedPlace } from "@foundry/ui/address-fields";

const kitAddressUi: AddressUi = {
  Field: ({ id, label, error, wide, inputProps, overlay, combo, footer }) => (
    <div className={cn("flex flex-col gap-2", wide && "sm:col-span-2", combo && "relative")}>
      <div className={cn(footer && "flex items-end gap-2")}>
        <div className="min-w-0 flex-1">
          <Field id={id} label={label} error={error} {...inputProps} />
        </div>
        {footer}
      </div>
      {overlay}
    </div>
  ),
  Select: ({ id, label, error, wide, disabled, placeholder, value, options, onChange }) => (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Select id={id} label={label} error={error} placeholder={placeholder} options={options} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  ),
  Suggestions: ({ id, items, activeIndex, optionId, onPick }) => (
    <ul id={id} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg">
      {items.map((s, i) => (
        <li
          key={s.placeId}
          id={optionId(s)}
          role="option"
          aria-selected={i === activeIndex}
          className={cn("flex min-h-11 cursor-pointer items-center rounded-[10px] px-3 text-[15px]", i === activeIndex ? "bg-[var(--muted)]" : "active:bg-[var(--muted)]")}
          // mousedown fires before the input blur closes the list
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(s);
          }}
        >
          {s.label}
        </li>
      ))}
    </ul>
  ),
  Spinner: () => null,
};

export type AddressFieldsProps = Omit<FoundryProps, "ui">;

/** Foundry address logic (autocomplete, autofill, presets) drawn with the customer kit. */
export function AddressFields({ className, ...props }: AddressFieldsProps) {
  return <FoundryAddressFields {...props} className={cn(FONT, "gap-4", className)} ui={kitAddressUi} />;
}
