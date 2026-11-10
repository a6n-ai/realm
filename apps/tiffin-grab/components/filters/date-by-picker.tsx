"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { useListNav } from "@/components/ds";

/**
 * Which date the top range filters on, as `?dateBy=`. The first option is the default and
 * leaves the param off the URL. Options come from the server so labels live in one place.
 */
export function DateByPicker({ value, options }: { value: string; options: readonly { value: string; label: string }[] }) {
  const nav = useListNav();
  const pathname = usePathname();
  const params = useSearchParams();
  const change = (v: string) => {
    const sp = new URLSearchParams(params.toString());
    if (v === options[0]?.value) sp.delete("dateBy");
    else sp.set("dateBy", v);
    sp.delete("page");
    nav(`${pathname}?${sp.toString()}`);
  };
  return (
    <Select value={value} onValueChange={change}>
      <SelectTrigger aria-label="Date filter type" className="w-52">
        {/* Radix only fills SelectValue after the menu first opens; give it the label up front. */}
        <SelectValue>{options.find((o) => o.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
