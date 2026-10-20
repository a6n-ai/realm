"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "@foundry/themes";
import { Button } from "@foundry/ui/button";
import { HeaderTooltip } from "@/components/customer/header-tooltip";

// The server can't know the theme, so the icon swaps in CSS off html.dark rather than
// from resolvedTheme, which would render differently on the client and fail hydration.
export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <HeaderTooltip label="Toggle theme">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Toggle light or dark mode"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        <SunIcon className="hidden size-4 dark:block" />
        <MoonIcon className="size-4 dark:hidden" />
      </Button>
    </HeaderTooltip>
  );
}
