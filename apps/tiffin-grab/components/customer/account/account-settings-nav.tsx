"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@realm/ui/cn";
import { CUSTOMER_ACCOUNT_NAV } from "@/app/(customer)/me/(account-settings)/nav.config";

/**
 * Desktop account settings nav — vertical rail (staff AccountNav pattern).
 * Mobile uses the account hub list instead of this chrome.
 */
export function AccountSettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account settings" className="hidden md:block">
      <ul className="flex flex-col gap-0.5">
        {CUSTOMER_ACCOUNT_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "ring-offset-background focus-visible:ring-ring flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                  active
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
