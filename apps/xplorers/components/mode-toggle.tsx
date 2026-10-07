"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "@foundry/themes";
import { Button } from "@foundry/ui/button";
import { HeaderTooltip } from "@/components/customer/header-tooltip";

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const label = dark ? "Light mode" : "Dark mode";
  return (
    <HeaderTooltip label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={() => setTheme(dark ? "light" : "dark")}
      >
        {dark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
      </Button>
    </HeaderTooltip>
  );
}
