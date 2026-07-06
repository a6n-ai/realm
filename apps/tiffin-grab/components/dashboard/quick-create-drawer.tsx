"use client";
import { ClipboardListIcon, PackageIcon, UserPlusIcon, type LucideIcon } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@realm/ui/drawer";
import { useQuickAdd, type QuickAddKind } from "./quick-add-provider";

// The FAB chooser: three large create rows. Each opens the matching add-popup
// (mounted once at the shell by QuickAddProvider, which lazily loads its form
// data) with controlled open, then closes this chooser.
const CREATES: { kind: QuickAddKind; title: string; description: string; icon: LucideIcon }[] = [
  { kind: "order", title: "New order", description: "Build an order for a customer", icon: PackageIcon },
  { kind: "inquiry", title: "New inquiry", description: "Log a fresh lead", icon: ClipboardListIcon },
  { kind: "customer", title: "New customer", description: "Add a customer directly", icon: UserPlusIcon },
];

export function QuickCreateDrawer({
  role,
  open,
  onOpenChange,
}: {
  role: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const quickAdd = useQuickAdd();
  const staff = role === "admin" || role === "member";
  if (!staff) return null;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Create</DrawerTitle>
        </DrawerHeader>
        <div className="grid gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {CREATES.map((c) => (
            <button
              key={c.kind}
              type="button"
              onClick={() => {
                quickAdd?.(c.kind);
                onOpenChange(false);
              }}
              className="hover:bg-accent flex min-h-11 items-center gap-3 rounded-lg border p-3 text-left transition-colors active:scale-[0.99]"
            >
              <span className="bg-primary/12 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
                <c.icon className="size-5" />
              </span>
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{c.title}</span>
                <span className="text-muted-foreground text-xs">{c.description}</span>
              </span>
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
