"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { Button } from "@realm/ui/button";

/** Sticky top chrome for public subscribe/checkout — Back + Close so users aren't trapped. */
export function SubscribeChrome({
  closeHref,
  onBack,
  backLabel = "Back",
}: {
  closeHref: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  const router = useRouter();
  return (
    <div className="bg-background/95 sticky top-0 z-30 -mx-4 mb-4 flex items-center justify-between border-b px-4 py-2.5 backdrop-blur sm:-mx-0 sm:px-0">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => (onBack ? onBack() : router.back())}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        {backLabel}
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" asChild aria-label="Close">
        <Link href={closeHref}>
          <XIcon />
        </Link>
      </Button>
    </div>
  );
}
