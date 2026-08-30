"use client";

import { RoutedTabNav } from "@realm/design-system";

const SUBTABS = [
  { label: "Delivery options", href: "/dashboard/settings/delivery/options" },
  { label: "Coverage", href: "/dashboard/settings/delivery/zones" },
];

/** Routed sub-tabs — same underline-nav style as @realm/notifications/ui's NotificationsNav. */
export function DeliveryTabs() {
  return <RoutedTabNav tabs={SUBTABS} ariaLabel="Delivery settings sections" />;
}
