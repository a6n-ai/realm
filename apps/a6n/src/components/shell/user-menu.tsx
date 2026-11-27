import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
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
import { initials } from "@foundry/ui/initials";
import { localStore } from "@foundry/ui/safe-storage";
import { Link, useNavigate } from "@tanstack/react-router";
import { EllipsisIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "../../lib/auth/client";
import { isThemePref, resolveTheme, THEME_KEY, type ThemePref } from "../../lib/theme";

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

export function UserMenu({ name }: { name: string }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useThemePref();
  return (
    <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
      <Avatar size="sm">
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-sm text-sidebar-foreground group-data-[collapsible=icon]:hidden">{name}</span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`${name} menu`} className="group-data-[collapsible=icon]:hidden" />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="min-w-44">
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
    </div>
  );
}
