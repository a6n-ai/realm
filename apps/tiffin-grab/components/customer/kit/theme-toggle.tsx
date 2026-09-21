"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@foundry/themes";
import { cn, FOCUS } from "./cn";

const ORDER = ["light", "dark", "system"] as const;
type Mode = (typeof ORDER)[number];
const ICON = { light: Sun, dark: Moon, system: Monitor };

interface ThemeToggleProps {
  value?: Mode;
  onChange?: (next: Mode) => void;
  className?: string;
}

/** One 44px button that cycles light, dark, system. Cycling beats a popover: one tap, no overlay to dismiss;
 * the full 3-way choice lives in the Menu sheet. Controlled props exist for the style guide and tests. */
export function ThemeToggle(props: ThemeToggleProps) {
  const ctx = useTheme();
  const current = (props.value ?? (ctx.theme as Mode)) || "system";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = ICON[current];
  return (
    <button
      type="button"
      aria-label={`Theme: ${current}. Switch to ${next}`}
      onClick={() => (props.onChange ?? ctx.setTheme)(next)}
      className={cn(FOCUS, "grid size-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--card)] [touch-action:manipulation] active:scale-[.97]", props.className)}
    >
      <Icon aria-hidden className="size-[18px]" />
    </button>
  );
}
