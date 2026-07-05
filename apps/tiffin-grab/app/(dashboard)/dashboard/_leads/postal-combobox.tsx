"use client";

import { useMemo, useState } from "react";
import { CheckIcon, ChevronsUpDown, MapPinIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@realm/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@realm/ui/popover";
import { cn } from "@realm/ui/cn";
import { matchZone, type ZoneLike } from "@/lib/catalog/postal";

type Opt = { prefix: string; zone: ZoneLike };

export function PostalCombobox({
  value,
  onChange,
  zones,
  id,
  placeholder = "e.g. M5V 2T6",
}: {
  value: string;
  onChange: (v: string) => void;
  zones: ZoneLike[];
  id?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const options = useMemo<Opt[]>(
    () =>
      zones
        .filter((z) => z.active)
        .flatMap((zone) => zone.postalPrefixes.map((prefix) => ({ prefix, zone }))),
    [zones],
  );

  const matched = value ? matchZone(value, zones) : null;

  return (
    <div className="grid gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="justify-between font-normal uppercase"
          >
            {value || <span className="text-muted-foreground normal-case">{placeholder}</span>}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            {/* Free text: typing sets the value directly so out-of-area codes are enterable. */}
            <CommandInput
              placeholder="Type a postal code…"
              value={value}
              onValueChange={(v) => onChange(v.toUpperCase())}
            />
            <CommandList>
              <CommandEmpty>No matching zone — code kept as typed.</CommandEmpty>
              <CommandGroup heading="Delivery zones">
                {options.map(({ prefix, zone }) => (
                  <CommandItem
                    key={`${zone.name}-${prefix}`}
                    value={`${prefix} ${zone.name}`}
                    onSelect={() => {
                      onChange(prefix.toUpperCase());
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <MapPinIcon className="size-3.5 opacity-60" />
                    <span className="font-medium">{prefix}</span>
                    <span className="text-muted-foreground flex-1 text-sm">
                      {zone.name} · {zone.slotWindow}
                    </span>
                    <CheckIcon
                      className={cn("size-4", value.toUpperCase().startsWith(prefix.toUpperCase()) ? "opacity-100" : "opacity-0")}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value ? (
        matched ? (
          <span className="text-ok flex items-center gap-1.5 text-sm font-medium">
            <MapPinIcon className="size-3.5" />
            Zone {matched.name} · {matched.slotWindow}
          </span>
        ) : (
          <span className="text-warn flex items-center gap-1.5 text-sm font-medium">
            <MapPinIcon className="size-3.5" />
            Out of delivery area — waitlist
          </span>
        )
      ) : null}
    </div>
  );
}
