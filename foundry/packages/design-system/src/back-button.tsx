"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { Button } from "@foundry/ui/button";

/**
 * Goes to the actual previous page via browser history when one exists in this
 * tab (e.g. arrived from a list page), falling back to `href` for direct/deep
 * links (shared URL, notification) where there is no in-app history to pop.
 */
export function BackButton({
  href,
  label = "Back",
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("text-muted-foreground hover:text-foreground -ml-2 gap-1.5", className)}
      onClick={() => (window.history.length > 1 ? router.back() : router.push(href))}
    >
      <ArrowLeftIcon className="size-3.5" />
      {label}
    </Button>
  );
}
