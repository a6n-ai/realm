"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type SubTab = { label: string; href: string };

const SUBTABS: SubTab[] = [
  { label: "Coupons", href: "/dashboard/settings/discounts/coupons" },
  { label: "Rep allowance", href: "/dashboard/settings/discounts/rep-allowance" },
  { label: "Enabled kinds", href: "/dashboard/settings/discounts/kinds" },
];

// Secondary routed sub-tabs for Discounts. A segmented control to read as one
// level below the primary settings tabs; still real links so each sub-section
// keeps its own URL. Concentric radius: outer rounded-lg over inner rounded-md
// across the p-1 gutter.
export function DiscountsTabs() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Discount settings">
      <ul className="bg-muted text-muted-foreground inline-flex w-fit items-center gap-1 rounded-lg p-1">
        {SUBTABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap",
                  "ring-offset-background transition-[color,background-color,box-shadow,transform] outline-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
