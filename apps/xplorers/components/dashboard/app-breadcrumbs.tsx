"use client";

import { Breadcrumbs } from "@foundry/design-system";

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  account: "Account",
  settings: "Settings",
  users: "Users",
  sessions: "Sessions",
  new: "New",
};

export function AppBreadcrumbs() {
  return <Breadcrumbs resolveLabel={(seg) => LABELS[seg] ?? seg} />;
}
