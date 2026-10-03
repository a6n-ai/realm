"use client";

import type { ReactNode } from "react";
import { cn } from "@foundry/ui/cn";
import { useIsMobile } from "@foundry/ui/use-mobile";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@foundry/ui/sheet";
import { ResponsiveDialog } from "@foundry/design-system";

/**
 * Long create forms (New order): a full-height side drawer on desktop so the form has
 * room, and the usual ResponsiveDialog top drawer on phones. Same props as
 * ResponsiveDialog, so the content doesn't change between the two.
 */
export function FormDrawer({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  flush = false,
}: {
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  trigger?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        trigger={trigger}
        title={title}
        description={description}
        footer={footer}
        flush={flush}
        contentClassName="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0"
      >
        {children}
      </ResponsiveDialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 data-[side=right]:sm:max-w-2xl">
        {/* pr-12 keeps the title clear of the close button. */}
        <SheetHeader className="shrink-0 gap-1 px-6 pt-6 pr-12 pb-4">
          <SheetTitle className="text-lg font-semibold tracking-[-0.01em]">{title}</SheetTitle>
          {description && <SheetDescription className="text-pretty">{description}</SheetDescription>}
        </SheetHeader>
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", !flush && "px-6 pb-6")}>{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/40 px-6 py-4">{footer}</div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
