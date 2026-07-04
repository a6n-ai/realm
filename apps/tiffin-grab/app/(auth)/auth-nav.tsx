"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, HomeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shared top nav for every (auth) screen: step back or jump to the marketing home.
export function AuthNav() {
  const router = useRouter();
  return (
    <nav className="absolute inset-x-0 top-0 flex items-center justify-between p-4 md:p-6">
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.back()}>
        <ArrowLeftIcon className="size-4" />
        Back
      </Button>
      <Button asChild variant="ghost" size="sm" className="gap-1.5">
        <Link href="/">
          <HomeIcon className="size-4" />
          Home
        </Link>
      </Button>
    </nav>
  );
}
