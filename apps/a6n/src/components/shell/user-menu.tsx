import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { initials } from "@foundry/ui/initials";
import { localStore } from "@foundry/ui/safe-storage";
import { Link, useNavigate } from "@tanstack/react-router";
import { EllipsisIcon, LogOutIcon, MonitorIcon, MoonIcon, SettingsIcon, SunIcon, UserRoundIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { authClient } from "../../lib/auth/client";
import { isThemePref, resolveTheme, stepTheme, THEME_KEY, THEME_ORDER, type ThemePref } from "../../lib/theme";

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
  const choose = (next: ThemePref) => {
    setPref(next);
    localStore.set(THEME_KEY, next);
    applyTheme(next);
  };
  return [pref, choose] as const;
}

const THEME_ICONS: Record<ThemePref, { icon: typeof SunIcon; label: string }> = {
  system: { icon: MonitorIcon, label: "System" },
  light: { icon: SunIcon, label: "Light" },
  dark: { icon: MoonIcon, label: "Dark" },
};

// Inline segmented control in the menu; choosing does not close the menu.
function ThemeSwitch({ value, onChange }: { value: ThemePref; onChange: (next: ThemePref) => void }) {
  const group = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-full border p-0.5"
      onKeyDown={(e) => {
        const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        e.stopPropagation();
        const next = stepTheme(value, dir);
        onChange(next);
        group.current?.querySelector<HTMLElement>(`[data-theme-option="${next}"]`)?.focus();
      }}
    >
      {THEME_ORDER.map((t) => {
        const { icon: Icon, label } = THEME_ICONS[t];
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={value === t}
            aria-label={label}
            tabIndex={value === t ? 0 : -1}
            data-theme-option={t}
            onClick={() => onChange(t)}
            className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-checked:bg-muted aria-checked:text-foreground"
          >
            <Icon aria-hidden className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}

export function UserMenu({ name, email }: { name: string; email: string }) {
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
        <DropdownMenuContent align="end" side="top" className="w-64">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="grid min-w-0 flex-1">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="truncate text-sm text-muted-foreground">{email}</span>
            </div>
            <DropdownMenuItem render={<Link to="/settings/account" aria-label="Account settings" />} className="size-8 shrink-0 justify-center p-0">
              <SettingsIcon />
            </DropdownMenuItem>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link to="/settings/account" />} className="justify-between">
            Account settings
            <UserRoundIcon />
          </DropdownMenuItem>
          <div className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
            Theme
            <ThemeSwitch value={theme} onChange={setTheme} />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="justify-between"
            onClick={async () => {
              await authClient.signOut();
              await navigate({ to: "/login" });
            }}
          >
            Log Out
            <LogOutIcon />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
