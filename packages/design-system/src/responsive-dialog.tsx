"use client";
import type { ReactNode } from "react";
import { useIsMobile } from "@realm/ui/use-mobile";
import { cn } from "@realm/ui/cn";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@realm/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@realm/ui/drawer";

// One create/edit surface: Dialog on desktop. Mobile defaults to a top drawer
// (admin inquiry/order forms start at the top; no blank gap under a bottom
// sheet). Pass direction="bottom" for customer task sheets (vacation, skip).
export function ResponsiveDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  contentClassName,
  direction = "top",
  nested = false,
  handleOnly = false,
}: {
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  trigger?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  direction?: "top" | "bottom";
  /** Nested Vaul drawer — required when this sheet opens from inside another drawer. */
  nested?: boolean;
  /** Only the handle swipes the sheet closed; inner widgets (calendars) keep pointer events. */
  handleOnly?: boolean;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Drawer
        nested={nested}
        handleOnly={handleOnly}
        direction={direction}
        open={open}
        onOpenChange={onOpenChange}
      >
        {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
        <DrawerContent
          className={cn(
            "flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0",
            direction === "top" ? "rounded-b-2xl" : "rounded-t-2xl",
            contentClassName,
          )}
        >
          <DrawerHeader className="shrink-0 text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer ? (
            <div className="shrink-0 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className={cn(
          "flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
          contentClassName,
        )}
      >
        <DialogHeader className="shrink-0 space-y-1.5 px-4 pt-4 text-left">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t bg-background px-4 py-3">{footer}</div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
