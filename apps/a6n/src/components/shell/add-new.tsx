import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { useRouteContext } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { createItems } from "../nav";
import { useCreate } from "./create-dialogs";

export function CreateNewMenu() {
  const { shell } = useRouteContext({ from: "/_app" });
  const create = useCreate();
  const items = createItems(shell.permissions);
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      {/* Vercel's top-bar Create New: a quiet ghost button, plus icon and label, no chevron. */}
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-1.5 px-2.5 font-medium" />}>
        <PlusIcon aria-hidden className="size-4" />
        Create New
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {items.map((c) => (
          <DropdownMenuItem key={c.kind} onClick={() => create(c.kind)}>
            {c.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
