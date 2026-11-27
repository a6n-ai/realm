import { AppShell } from "@foundry/console/app-shell";
import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { ChevronsUpDownIcon } from "lucide-react";
import { authClient } from "../lib/auth/client";
import type { Shell } from "../lib/auth/shell";
import { visibleNav } from "./nav";

function Brand() {
  return (
    <Link to="/inquiries" className="flex h-9 items-center gap-2 px-2 font-semibold text-(--strong)">
      <img src="/icon.svg" alt="" className="size-6" />
      <span className="group-data-[collapsible=icon]:hidden">a6n</span>
    </Link>
  );
}

function UserMenu({ name }: { name: string }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="w-full justify-between" aria-label={`${name} menu`} />}>
        <span className="truncate group-data-[collapsible=icon]:hidden">Account</span>
        <ChevronsUpDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        <DropdownMenuItem render={<Link to="/account" />}>Account</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await authClient.signOut();
            await navigate({ to: "/login" });
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function ConsoleLayout({ shell }: { shell: Shell }) {
  return (
    <AppShell
      appName="a6n"
      brand={<Brand />}
      nav={visibleNav(shell.user.role, shell.unassigned)}
      user={{ name: shell.user.name, email: shell.user.email }}
      userMenu={<UserMenu name={shell.user.name} />}
    >
      <Outlet />
    </AppShell>
  );
}
