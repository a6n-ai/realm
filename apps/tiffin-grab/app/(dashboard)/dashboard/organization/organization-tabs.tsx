import { RoutedTabNav } from "@foundry/design-system";

const TABS = [
  { label: "Users", href: "/dashboard/organization/users" },
  { label: "Clients", href: "/dashboard/organization/clients" },
] as const;

export function OrganizationTabs() {
  return <RoutedTabNav tabs={TABS} ariaLabel="Organization sections" />;
}
