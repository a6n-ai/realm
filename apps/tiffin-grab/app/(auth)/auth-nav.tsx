"use client";

import Link from "next/link";
import { HomeIcon } from "lucide-react";
import { Button } from "@realm/ui/button";

// Shared top nav for every (auth) screen. No Back button — auth screens are
// entry points (login folds PIN + password into one view), so there is nothing
// coherent to step back to. Home only.
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
