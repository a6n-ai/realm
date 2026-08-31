import { RoutedTabNav, type RoutedTabNavItem } from "@foundry/design-system";

export type NavTab = RoutedTabNavItem;

/** Every app has these; campaigns are opt-in per app (see the `tabs` prop). */
const DEFAULT_TABS: NavTab[] = [
  { href: "/dashboard/notifications/templates", label: "Templates" },
  { href: "/dashboard/notifications/emails", label: "Emails" },
  { href: "/dashboard/notifications/logs", label: "Logs" },
  { href: "/dashboard/notifications/analytics", label: "Analytics" },
];

export function NotificationsNav({ tabs = DEFAULT_TABS }: { tabs?: NavTab[] } = {}) {
  return <RoutedTabNav tabs={tabs} ariaLabel="Notifications sections" />;
}
