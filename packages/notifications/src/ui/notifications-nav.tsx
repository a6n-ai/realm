"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@realm/ui/cn";

const TABS = [
  { href: "/dashboard/notifications/templates", label: "Templates" },
  { href: "/dashboard/notifications/emails", label: "Emails" },
  { href: "/dashboard/notifications/logs", label: "Logs" },
  { href: "/dashboard/notifications/analytics", label: "Analytics" },
];

export function NotificationsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
