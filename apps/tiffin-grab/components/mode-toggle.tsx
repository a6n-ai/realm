"use client";

import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from "lucide-react";
import { useTheme } from "@realm/themes";
import { cn } from "@realm/ui/cn";

const OPTIONS: { value: "light" | "system" | "dark"; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
];

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="group" aria-label="Theme" className="inline-flex items-center gap-0.5 rounded-full border p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setTheme(o.value)}
          aria-pressed={theme === o.value}
          title={o.label}
          className={cn(
            "grid size-7 place-items-center rounded-full transition-colors",
            theme === o.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <o.icon className="size-4" />
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
