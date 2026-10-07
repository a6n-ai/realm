"use client";

import { Breadcrumbs } from "@foundry/design-system";

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  account: "Account",
  settings: "Settings",
  users: "Users",
  general: "General",
  personalization: "Personalization",
  integrations: "Integrations",
  payments: "Payments",
  requests: "Pending verification",
  all: "All payments",
  finance: "Finance",
  ledger: "Ledger",
  add: "Add",
  classes: "Classes",
  sessions: "Sessions",
  new: "New",
  customers: "Customers",
};

export function AppBreadcrumbs() {
  return <Breadcrumbs resolveLabel={(seg) => LABELS[seg] ?? seg} />;
}
