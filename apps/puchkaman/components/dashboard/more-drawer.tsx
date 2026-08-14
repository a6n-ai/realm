"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOutIcon, UserIcon } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@realm/ui/drawer";
import type { PluginCatalogStatus } from "@realm/crm";
import { signOut } from "@/lib/auth/client";
import { getNavSections } from "./app-sidebar";

/** Full mobile navigation from the bottom bar's More tab. */
export function MoreDrawer({
  open,
  onOpenChange,
  statuses = {},
  granted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses?: Record<string, PluginCatalogStatus>;
  granted?: string[];
}) {
  const router = useRouter();
  const sections = getNavSections({ statuses, granted });
  const rowClass =
    "hover:bg-accent flex min-h-11 items-center gap-3 rounded-md px-2 text-left text-sm transition-colors";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Menu</DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {sections.map((section) => (
            <div key={section.label} className="py-2">
              <p className="text-muted-foreground/80 px-1 pb-1 text-[0.7rem] font-semibold tracking-[0.08em] uppercase">
                {section.label}
              </p>
              <div className="grid">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    className={rowClass}
                  >
                    <item.icon className="text-muted-foreground size-5" />
                    <span>{item.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="bg-background border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="grid gap-1">
            <Link
              href="/dashboard/account"
              onClick={() => onOpenChange(false)}
              className={rowClass}
            >
              <UserIcon className="text-muted-foreground size-5" />
              <span>Account</span>
            </Link>
            <button
              type="button"
              onClick={() =>
                void signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      router.push("/login");
                    },
                  },
                })
              }
              className={rowClass}
            >
              <LogOutIcon className="text-muted-foreground size-5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
