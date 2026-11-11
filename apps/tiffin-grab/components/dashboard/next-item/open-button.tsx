"use client";
import { ArrowUpRightIcon } from "lucide-react";
import { RowActionTooltipButton } from "@/components/ds";

/** Icon-only Open on a Next card; a real link, so cmd/middle-click and new-tab work. */
export function NextItemOpenButton({ href, label }: { href: string; label: string }) {
  return <RowActionTooltipButton icon={ArrowUpRightIcon} label={label} href={href} />;
}
