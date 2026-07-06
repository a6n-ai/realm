"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockIcon, LogOutIcon, UserIcon } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@realm/ui/drawer";
import { signOut } from "@/lib/auth/client";
import { lockSession } from "@/lib/auth/lock-actions";
import { SECTIONS } from "./app-sidebar";

// Full mobile navigation surfaced from the bottom bar's More tab: every
// role-filtered SECTIONS group as link rows, plus account/lock/logout in a
// pinned footer. Mirrors the sidebar; the bottom bar owns mobile nav.
export function MoreDrawer({
  role,
  open,
  onOpenChange,
}: {
  role: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const sections = SECTIONS.map((s) => ({
    label: s.label,
    items: s.items.filter((i) => i.roles.includes(role)),
  })).filter((s) => s.items.length > 0);

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
                  <Link key={item.href} href={item.href} onClick={() => onOpenChange(false)} className={rowClass}>
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
            <Link href="/dashboard/account" onClick={() => onOpenChange(false)} className={rowClass}>
              <UserIcon className="text-muted-foreground size-5" />
              <span>Account</span>
            </Link>
            <button
              type="button"
              onClick={async () => {
                onOpenChange(false);
                await lockSession();
                router.push("/login");
              }}
              className={rowClass}
            >
              <LockIcon className="text-muted-foreground size-5" />
              <span>Lock session</span>
            </button>
            <button
              type="button"
              onClick={() =>
                signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/login"; } } })
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
