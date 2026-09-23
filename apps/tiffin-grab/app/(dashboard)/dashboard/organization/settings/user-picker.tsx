"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@foundry/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@foundry/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { searchUsersByEmailAction } from "@/lib/services/organizations-actions";
import type { UserSearchRow } from "@/lib/services/organizations.service";

export function UserPicker({ onSelect }: { onSelect: (user: UserSearchRow) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchRow[]>([]);
  const [selected, setSelected] = useState<UserSearchRow | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      startTransition(async () => {
        setResults(await searchUsersByEmailAction(query));
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="justify-between">
          {selected ? selected.email : "Search by email…"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type an email…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{pending ? "Searching…" : "No matches."}</CommandEmpty>
            <CommandGroup>
              {results.map((user) => (
                <CommandItem
                  key={user.publicId}
                  value={user.publicId}
                  onSelect={() => {
                    setSelected(user);
                    onSelect(user);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${selected?.publicId === user.publicId ? "opacity-100" : "opacity-0"}`}
                  />
                  {user.email}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
