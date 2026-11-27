import { AppShell } from "@foundry/console/app-shell";
import { Button } from "@foundry/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@foundry/ui/dropdown-menu";
import { localStore } from "@foundry/ui/safe-storage";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { ChevronsUpDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "../lib/auth/client";
import { AppMark } from "./auth/auth-kit";
import type { Shell } from "../lib/auth/shell";
import { isThemePref, resolveTheme, THEME_KEY, type ThemePref } from "../lib/theme";
import { visibleNav } from "./nav";

function Brand() {
  return (
    <Link to="/inquiries" className="flex h-9 items-center gap-2 px-2 font-semibold text-(--strong)">
      <AppMark className="size-6" />
      <span className="group-data-[collapsible=icon]:hidden">a6n</span>
    </Link>
  );
}

function applyTheme(pref: ThemePref) {
  const dark = resolveTheme(pref, matchMedia("(prefers-color-scheme: dark)").matches) === "dark";
  document.documentElement.classList.toggle("dark", dark);
}

function useThemePref() {
  const [pref, setPref] = useState<ThemePref>("dark");
  useEffect(() => {
    const stored = localStore.get(THEME_KEY);
    setPref(isThemePref(stored) ? stored : "dark");
  }, []);
  // System follows the OS live, like Vercel.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);
  const choose = (next: string) => {
    if (!isThemePref(next)) return;
    setPref(next);
    localStore.set(THEME_KEY, next);
    applyTheme(next);
  };
  return [pref, choose] as const;
}

function UserMenu({ name }: { name: string }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useThemePref();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="w-full justify-between" aria-label={`${name} menu`} />}>
        <span className="truncate group-data-[collapsible=icon]:hidden">Account</span>
        <ChevronsUpDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        <DropdownMenuItem render={<Link to="/account" />}>Account</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
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
