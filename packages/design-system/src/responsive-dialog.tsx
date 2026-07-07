"use client";
import type { ReactNode } from "react";
import { useIsMobile } from "@realm/ui/use-mobile";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@realm/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@realm/ui/drawer";

// One create/edit surface: a bottom drawer on mobile (vaul spring + grab handle),
// the standard Dialog on desktop. Same prop surface either way.
export function ResponsiveDialog({
  open, onOpenChange, trigger, title, description, children, footer, contentClassName,
}: {
  open?: boolean; onOpenChange?: (o: boolean) => void;
  trigger?: ReactNode; title: string; description?: string;
  children: ReactNode; footer?: ReactNode; contentClassName?: string;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
        <DrawerContent className={contentClassName}>
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          {/* Render children directly (like the desktop Dialog): every form here
              owns its own scrollable body. Wrapping in a second overflow-y-auto
              container double-nested the scroll on mobile and pushed the top
              fields (name/phone) off-screen, making the form unfillable. */}
          {children}
          {footer && <div className="sticky bottom-0 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {footer}
      </DialogContent>
    </Dialog>
  );
}
