import { can } from "@/lib/auth/guards";

type Perms = Parameters<typeof can>[0];

// Matches the guard on each page. Hrefs not listed (Overview, Account) are open to any signed-in staff.
const NAV_PERMISSIONS: Record<string, Perms> = {
  "/dashboard/analytics": { analytics: ["read"] },
  "/dashboard/inquiries": { inquiry: ["read"] },
  "/dashboard/orders": { order: ["read"] },
  "/dashboard/labels": { delivery: ["read"] },
  "/dashboard/dispatch": { delivery: ["read"] },
  "/dashboard/renewals": { order: ["read"] },
  "/dashboard/customers": { customer: ["read"] },
  "/dashboard/tickets": { ticket: ["read"] },
  "/dashboard/catalog": { catalog: ["read"] },
  "/dashboard/menus": { menu: ["read"] },
  "/dashboard/payments": { finance: ["manage"] },
  "/dashboard/wallet": { wallet: ["read"] },
  "/dashboard/discounts": { discount: ["read"] },
  "/dashboard/notifications": { notification: ["read"] },
  "/dashboard/customer-groups": { customer: ["manage"] },
  "/dashboard/organization": { member: ["update"] },
  "/dashboard/settings": { settings: ["read"] },
};

const OPEN_NAV_HREFS = ["/dashboard", "/dashboard/account"];

/** Nav hrefs the caller's org role may open. */
export async function allowedNavHrefs(): Promise<string[]> {
  const entries = await Promise.all(
    Object.entries(NAV_PERMISSIONS).map(async ([href, perms]) => [href, await can(perms)] as const),
  );
  return [...OPEN_NAV_HREFS, ...entries.filter(([, ok]) => ok).map(([href]) => href)];
}
