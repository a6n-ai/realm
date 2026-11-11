"use client";
import { useRouter } from "next/navigation";
import { ArrowUpRightIcon } from "lucide-react";
import { RowActionTooltipButton } from "@/components/ds";

/** Icon-only Open on a Next card; the card's name link still works without JS. */
export function NextItemOpenButton({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return <RowActionTooltipButton icon={ArrowUpRightIcon} label={label} onClick={() => router.push(href)} />;
}
