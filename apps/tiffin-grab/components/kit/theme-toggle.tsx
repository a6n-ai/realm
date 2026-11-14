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
  /** Light and dark only: one tap flips what the page shows now (system resolves to it first). */
  lightDark?: boolean;
}

/** One 44px button that cycles light, dark, system. Cycling beats a popover: one tap, no overlay to dismiss;
 * the full 3-way choice lives in the Menu sheet. Controlled props exist for the style guide and tests. */
// No ThemeProvider above it (a component rendered on its own, e.g. in a test): useTheme throws, and the toggle
// renders nothing rather than taking the page down. The hook still runs on every render, so hook order holds.
function useThemeIfAny() {
  try {
    return useTheme();
  } catch {
    return null;
  }
}

export function ThemeToggle(props: ThemeToggleProps) {
  const ctx = useThemeIfAny();
  if (!ctx && props.value == null) return null;
  // Light / dark: the server can't know which one the browser shows, so both icons render and CSS (the html "dark"
  // class) picks one; the label is fixed and the tap reads the page. Server and client markup always match.
  if (props.lightDark) {
    return (
      <button
        type="button"
        aria-label="Switch between light and dark"
        onClick={() => (props.onChange ?? ctx?.setTheme)?.(document.documentElement.classList.contains("dark") ? "light" : "dark")}
        className={cn(FOCUS, "group relative grid size-11 place-items-center overflow-hidden c-surface rounded-full bg-foreground/10 [touch-action:manipulation] transition-[background-color,border-color,transform] duration-150 hover:border-primary hover:bg-muted active:scale-90 motion-reduce:transition-none", props.className)}
      >
        {/* Both icons share one cell; the html "dark" class swaps them with a turn, so the swap needs no JS state. */}
        <Sun aria-hidden className="col-start-1 row-start-1 size-[18px] transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:rotate-45 dark:-rotate-90 dark:scale-0 dark:opacity-0 motion-reduce:transition-none" />
        <Moon aria-hidden className="col-start-1 row-start-1 size-[18px] rotate-90 scale-0 opacity-0 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] dark:rotate-0 dark:scale-100 dark:opacity-100 dark:group-hover:-rotate-12 motion-reduce:transition-none" />
      </button>
    );
  }
  const current = (props.value ?? (ctx?.theme as Mode)) || "system";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = ICON[current];
  return (
    <button
      type="button"
      aria-label={`Theme: ${current}. Switch to ${next}`}
      onClick={() => (props.onChange ?? ctx?.setTheme)?.(next)}
      className={cn(FOCUS, "grid size-11 place-items-center c-surface rounded-full bg-foreground/10 [touch-action:manipulation] transition-[background-color,border-color,transform] duration-150 hover:border-primary hover:bg-muted active:scale-[.97] motion-reduce:transition-none", props.className)}
    >
      <Icon aria-hidden className="size-[18px]" />
    </button>
  );
}
