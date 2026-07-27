"use client";

import { Breadcrumbs } from "@realm/design-system";

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  products: "Products",
  account: "Account",
  settings: "Settings",
  integrations: "Integrations",
  clover: "Clover",
};

export function AppBreadcrumbs() {
  return <Breadcrumbs resolveLabel={(seg) => LABELS[seg] ?? seg} />;
}
