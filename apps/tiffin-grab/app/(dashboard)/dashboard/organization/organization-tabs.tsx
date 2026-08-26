"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@realm/ui/tabs";

const TABS = [
  { id: "users", label: "Users", href: "/dashboard/organization/users" },
  { id: "clients", label: "Clients", href: "/dashboard/organization/clients" },
] as const;

export function OrganizationTabs() {
  const pathname = usePathname();
  const active = TABS.find((t) => pathname.startsWith(t.href))?.id ?? TABS[0].id;

  return (
    <Tabs value={active}>
      <TabsList aria-label="Organization sections">
        {TABS.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} asChild>
            <Link href={tab.href}>{tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
