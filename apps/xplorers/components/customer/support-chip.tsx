"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoyIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { HeaderTooltip } from "./header-tooltip";

/** Header support control — always visible path to /me/support. */
export function SupportChip() {
  const pathname = usePathname();
  const active = pathname === "/me/support" || pathname.startsWith("/me/support/");

  return (
    <HeaderTooltip label="Support">
      <Button
        asChild
        variant="ghost"
        size="icon"
        className={cn(active && "bg-secondary text-secondary-foreground")}
        aria-current={active ? "page" : undefined}
      >
        <Link href="/me/support" aria-label="Support">
          <LifeBuoyIcon className="size-4" />
        </Link>
      </Button>
    </HeaderTooltip>
  );
}
