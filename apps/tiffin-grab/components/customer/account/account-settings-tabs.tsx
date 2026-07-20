"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@realm/ui/tabs";
import { CUSTOMER_ACCOUNT_NAV } from "@/app/(customer)/me/(account-settings)/nav.config";

/** Desktop account sub-nav — mobile uses the account hub menu instead. */
export function AccountSettingsTabs() {
  const pathname = usePathname();
  const active = CUSTOMER_ACCOUNT_NAV.find((item) => pathname === item.href)?.key ?? "profile";

  return (
    <Tabs value={active}>
      <TabsList aria-label="Account settings sections" className="w-full justify-start overflow-x-auto">
        {CUSTOMER_ACCOUNT_NAV.map((item) => (
          <TabsTrigger key={item.key} value={item.key} asChild>
            <Link href={item.href}>
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
