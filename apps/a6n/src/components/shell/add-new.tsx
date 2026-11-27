import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { useRouteContext } from "@tanstack/react-router";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { createItems } from "../nav";
import { useCreate } from "./create-dialogs";

export function CreateNewMenu() {
  const { shell } = useRouteContext({ from: "/_app" });
  const create = useCreate();
  const items = createItems(shell.permissions);
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>
        <PlusIcon aria-hidden />
        Create New
        <ChevronDownIcon aria-hidden />
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
