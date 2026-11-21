"use client";
import Link from "next/link";
import { EllipsisIcon, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { ROW_ACTION_CLASS, RowActionTooltipButton } from "@/components/ds";

export type IconAction = {
  key: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  tone?: string;
  href?: string;
  onClick?: () => void;
  pending?: boolean;
};

/** `ariaLabel` replaces the visible label as the accessible name, for a WhatsApp or Call item that names the customer and number. */
export type MenuAction = { key: string; label: string; ariaLabel?: string; href?: string; onSelect?: () => void; destructive?: boolean };

/** A recommendation card's right side: up to two icon actions, then the rest under More actions. Dialogs the actions open are mounted by the caller, outside the menu. */
export function RecommendationActions({ primary, more }: { primary: IconAction[]; more: MenuAction[] }) {
  return (
    <>
      {primary.map(({ key, ...action }) => (
        <RowActionTooltipButton key={key} {...action} />
      ))}
      {more.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" aria-label="More actions" className={ROW_ACTION_CLASS} />}>
            <EllipsisIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {more.map((item) =>
              item.href ? (
                <DropdownMenuItem key={item.key} aria-label={item.ariaLabel} variant={item.destructive ? "destructive" : undefined} render={item.href.startsWith("/") ? <Link href={item.href} prefetch={false} /> : <a href={item.href} target="_blank" rel="noopener noreferrer" />}>
                  {item.label}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem key={item.key} aria-label={item.ariaLabel} variant={item.destructive ? "destructive" : undefined} onSelect={item.onSelect}>
                  {item.label}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}
