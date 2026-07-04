import { Role, type RoleValue } from "@realm/commons";

// SINGLE SOURCE OF TRUTH for the account sub-nav and per-section role gating.
// A role omits the groups/sections it lacks; it never reorders them. The
// `security` section page renders Password for everyone and PIN only for staff,
// so PIN never appears as a customer-reachable section here. There is no shared
// page that conditionally renders a role-specific section, so there is no leak.

export interface NavItem {
  /** Stable key used for guards (isSectionAllowed) and active-link matching. */
  key: string;
  label: string;
  /** Absolute href: /dashboard/account/<segment>. */
  href: string;
}

export interface NavGroup {
  heading?: string;
  items: NavItem[];
}

const seg = (s: string) => `/dashboard/account/${s}`;

const PROFILE_GROUP: NavGroup = {
  heading: "Profile",
  items: [
    { key: "profile", label: "Profile", href: seg("profile") },
    { key: "contact", label: "Contact", href: seg("contact") },
  ],
};

const SECURITY_GROUP: NavGroup = {
  heading: "Security",
  items: [{ key: "security", label: "Security", href: seg("security") }],
};

// admin and member resolve to the same staff branch (identical section set).
const STAFF_NAV: NavGroup[] = [PROFILE_GROUP, SECURITY_GROUP];

const USER_NAV: NavGroup[] = [
  PROFILE_GROUP,
  {
    heading: "Delivery",
    items: [
      { key: "address", label: "Delivery address", href: seg("address") },
      { key: "dietary", label: "Dietary & allergens", href: seg("dietary") },
      { key: "deliveryNotes", label: "Delivery notes", href: seg("delivery-notes") },
      { key: "notifications", label: "Notifications", href: seg("notifications") },
    ],
  },
  SECURITY_GROUP,
];

export const ACCOUNT_NAV: Record<RoleValue, NavGroup[]> = {
  [Role.ADMIN]: STAFF_NAV,
  [Role.MEMBER]: STAFF_NAV,
  [Role.USER]: USER_NAV,
};

// Derived from ACCOUNT_NAV so the nav and the page guards can never drift.
export const ALLOWED_SECTIONS: Record<RoleValue, Set<string>> = Object.fromEntries(
  (Object.keys(ACCOUNT_NAV) as RoleValue[]).map((role) => [
    role,
    new Set(ACCOUNT_NAV[role].flatMap((g) => g.items.map((i) => i.key))),
  ]),
) as Record<RoleValue, Set<string>>;

export function isSectionAllowed(role: RoleValue, key: string): boolean {
  return ALLOWED_SECTIONS[role]?.has(key) ?? false;
}
