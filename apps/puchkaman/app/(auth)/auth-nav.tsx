"use client";

import Link from "next/link";
import { HomeIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";

/** Shared top nav for every (auth) screen — matches tiffin-grab. */
export function AuthNav() {
  return (
    <nav className="absolute inset-x-0 top-0 flex items-center justify-end p-4 md:p-6">
      <Button asChild variant="ghost" size="sm" className="gap-1.5">
        <Link href="/">
          <HomeIcon className="size-4" />
          Home
        </Link>
      </Button>
    </nav>
  );
}
