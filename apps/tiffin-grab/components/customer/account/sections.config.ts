import {
  BellIcon,
  ClipboardListIcon,
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
  | "dietary"
  | "deliveryNotes"
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
  { key: "address", slug: "address", label: "Delivery address", hint: "Where your tiffins go", icon: MapPinIcon },
  { key: "dietary", slug: "dietary", label: "Dietary & allergens", hint: "What the kitchen avoids", icon: UtensilsCrossedIcon },
  { key: "deliveryNotes", slug: "delivery-notes", label: "Delivery notes", hint: "Gate code, drop-off spot", icon: ClipboardListIcon },
  { key: "notifications", slug: "notifications", label: "Notifications", hint: "Email and SMS alerts", icon: BellIcon },
  { key: "contact", slug: "contact", label: "Phone", hint: "How we reach you", icon: PhoneIcon },
];

export const accountSectionHref = (s: AccountSection) => `/me/account?section=${s.slug}`;

/** Role gating reuses the dashboard ACCOUNT_NAV so the two can never drift. */
export function sectionsForRole(role: RoleValue): AccountSection[] {
  return ACCOUNT_SECTIONS.filter((s) => isSectionAllowed(role, s.key));
}

export function sectionFromSlug(slug: string | undefined, allowed: AccountSection[]): AccountSection | null {
  return allowed.find((s) => s.slug === slug) ?? null;
}
