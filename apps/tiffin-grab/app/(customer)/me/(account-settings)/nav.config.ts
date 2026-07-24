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

/** Customer self-service account sections — mirrors dashboard USER_NAV paths under /me/*. */
export type CustomerAccountSectionKey =
  | "profile"
  | "contact"
  | "address"
  | "dietary"
  | "deliveryNotes"
  | "notifications"
  | "security";

export type CustomerAccountNavItem = {
  key: CustomerAccountSectionKey;
  label: string;
  href: string;
  icon: LucideIcon;
};

const seg = (s: string) => `/me/${s}`;

export const CUSTOMER_ACCOUNT_NAV: CustomerAccountNavItem[] = [
  { key: "profile", label: "Profile", href: seg("profile"), icon: UserIcon },
  { key: "contact", label: "Contact", href: seg("contact"), icon: PhoneIcon },
  { key: "address", label: "Address", href: seg("address"), icon: MapPinIcon },
  { key: "dietary", label: "Dietary", href: seg("dietary"), icon: UtensilsCrossedIcon },
  { key: "deliveryNotes", label: "Delivery notes", href: seg("delivery-notes"), icon: ClipboardListIcon },
  { key: "notifications", label: "Notifications", href: seg("notifications"), icon: BellIcon },
  { key: "security", label: "Security", href: seg("security"), icon: ShieldIcon },
];

export function customerSectionFromPath(pathname: string): CustomerAccountSectionKey {
  const hit = CUSTOMER_ACCOUNT_NAV.find((item) => pathname === item.href);
  return hit?.key ?? "profile";
}
