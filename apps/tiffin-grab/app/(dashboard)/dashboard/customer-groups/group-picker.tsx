"use client";

import { useState } from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@foundry/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { cn } from "@foundry/ui/cn";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { useGroupSearch } from "./use-group-search";

export type PickedGroup = { publicId: string; name: string; memberCount: number };

/** Searchable group select. `noneLabel` adds a clearing option (value null), e.g. "Everyone". */
export function GroupPicker({
  value,
  onChange,
  noneLabel,
  placeholder = "Pick a group",
  id,
}: {
  value: PickedGroup | null;
  onChange: (g: PickedGroup | null) => void;
  noneLabel?: string;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { groups, error, reload } = useGroupSearch(q, open);

  const pick = (g: PickedGroup | null) => {
    onChange(g);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="justify-between font-normal">
          {value ? value.name : <span className="text-muted-foreground">{noneLabel ?? placeholder}</span>}
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search groups by name" value={q} onValueChange={setQ} />
          <CommandList>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription className="flex items-center justify-between gap-2">
                  {error}
                  <Button type="button" size="sm" variant="outline" onClick={() => reload()}>Retry</Button>
                </AlertDescription>
              </Alert>
            ) : groups === null ? (
              <CommandEmpty>Loading groups...</CommandEmpty>
            ) : (
              <>
                {groups.length === 0 && <CommandEmpty>{q ? "No group matches that name." : "No customer groups yet."}</CommandEmpty>}
                <CommandGroup>
                  {noneLabel && !q && (
                    <CommandItem value="__none" onSelect={() => pick(null)}>
                      {noneLabel}
                      <CheckIcon className={cn("ml-auto", value ? "opacity-0" : "opacity-100")} />
                    </CommandItem>
                  )}
                  {groups.map((g) => (
                    <CommandItem key={g.publicId} value={g.publicId} onSelect={() => pick(g)}>
                      <span className="truncate">{g.name}</span>
                      <span className="text-muted-foreground ml-auto tabular-nums">{g.memberCount}</span>
                      <CheckIcon className={cn(value?.publicId === g.publicId ? "opacity-100" : "opacity-0")} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
