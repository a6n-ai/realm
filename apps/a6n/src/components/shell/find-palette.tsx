import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@foundry/ui/command";
import { Kbd } from "@foundry/ui/kbd";
import { useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Role } from "../../lib/auth/permissions";
import { useCreate } from "./create-dialogs";
import { type FindEntry, findEntries } from "./find";
import { isTypingTarget } from "./keys";

const GROUPS: FindEntry["group"][] = ["Pages", "Actions"];

export function FindPalette({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const create = useCreate();
  const entries = useMemo(() => findEntries(role), [role]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing) return;
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const bareF = e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
      if (!cmdK && !bareF) return;
      if (isTypingTarget(document.activeElement as HTMLElement | null)) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const pick = (entry: FindEntry) => {
    setOpen(false);
    if (entry.create) create(entry.create);
    else if (entry.to) {
      const at = entry.to.indexOf("?");
      const search = at < 0 ? undefined : Object.fromEntries(new URLSearchParams(entry.to.slice(at + 1)));
      void navigate({ to: (at < 0 ? entry.to : entry.to.slice(0, at)) as never, search: search as never });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-(--ui-radius-control) border bg-sidebar px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-data-[collapsible=icon]:hidden"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-left">Find</span>
        <Kbd>F</Kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Find" description="Jump to a page or action" className="duration-0">
        <Command>
          <CommandInput placeholder="Find…" />
          <CommandList>
            <CommandEmpty className="empty:hidden">No results.</CommandEmpty>
            {GROUPS.map((group) => {
              const items = entries.filter((e) => e.group === group);
              return items.length === 0 ? null : (
                <CommandGroup key={group} heading={group}>
                  {items.map((e) => (
                    <CommandItem key={e.id} value={`${e.label} ${e.id}`} onSelect={() => pick(e)}>
                      {e.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
