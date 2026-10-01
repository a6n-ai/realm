"use client";

import Image from "next/image";
import Link from "next/link";
import { HomeIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { SITE_NAME } from "@/lib/brand";

export function AuthNav() {
  return (
    <nav className="absolute inset-x-0 top-0 flex items-center justify-between p-4 md:p-6">
      <Link href="/" className="block rounded-lg bg-white px-2 py-1 leading-none">
        <Image src="/brand/logo-xplorers.png" alt={SITE_NAME} width={555} height={245} className="h-10 w-auto" />
      </Link>
      <Button asChild variant="ghost" size="sm" className="gap-1.5">
        <Link href="/">
          <HomeIcon className="size-4" />
          Home
        </Link>
      </Button>
    </nav>
  );
}
