import {
  BellIcon,
  CreditCardIcon,
  MapPinIcon,
  PhoneIcon,
  ShieldIcon,
  UserIcon,
  UtensilsCrossedIcon,
  type LucideIcon,
} from "lucide-react";
import type { RoleValue } from "@foundry/commons";
import { isSectionAllowed } from "@/app/(dashboard)/dashboard/account/nav.config";

export type AccountSectionKey =
  | "profile"
  | "contact"
  | "address"
  | "payment-methods"
  | "dietary"
  | "notifications"
  | "security";

export type AccountSection = {
  key: AccountSectionKey;
  /** `?section=` value, also the legacy /me/<slug> path segment. */
  slug: string;
  label: string;
  hint: string;
  icon: LucideIcon;
};

export const ACCOUNT_SECTIONS: AccountSection[] = [
  { key: "profile", slug: "profile", label: "Profile", hint: "Photo, name, username", icon: UserIcon },
  { key: "security", slug: "security", label: "Security", hint: "Email, password, delete account", icon: ShieldIcon },
  { key: "address", slug: "address", label: "Delivery address", hint: "Where your tiffins go, drop-off notes", icon: MapPinIcon },
  { key: "payment-methods", slug: "payment-methods", label: "Payment methods", hint: "Saved cards for renewals", icon: CreditCardIcon },
  { key: "dietary", slug: "dietary", label: "Dietary & allergens", hint: "What the kitchen avoids", icon: UtensilsCrossedIcon },
  { key: "notifications", slug: "notifications", label: "Notifications", hint: "Email and SMS alerts", icon: BellIcon },
  { key: "contact", slug: "contact", label: "Phone", hint: "How we reach you", icon: PhoneIcon },
];

export const accountSectionHref = (s: AccountSection) => `/me/account?section=${s.slug}`;

/** `cards`: Stripe is connected, so the saved-cards section exists. Role gating reuses the dashboard ACCOUNT_NAV so the two can never drift. */
export function sectionsForRole(role: RoleValue, opts: { cards?: boolean } = {}): AccountSection[] {
  return ACCOUNT_SECTIONS.filter((s) => isSectionAllowed(role, s.key) && (opts.cards || s.key !== "payment-methods"));
}

export function sectionFromSlug(slug: string | undefined, allowed: AccountSection[]): AccountSection | null {
  return allowed.find((s) => s.slug === slug) ?? null;
}
