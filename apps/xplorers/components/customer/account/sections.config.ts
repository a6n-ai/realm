import { ShieldIcon, UserIcon, type LucideIcon } from "lucide-react";

export type AccountSectionKey = "profile" | "security";

export type AccountSection = {
  key: AccountSectionKey;
  slug: string;
  label: string;
  hint: string;
  icon: LucideIcon;
};

export const ACCOUNT_SECTIONS: AccountSection[] = [
  { key: "profile", slug: "profile", label: "Profile", hint: "Photo, name, username", icon: UserIcon },
  { key: "security", slug: "security", label: "Security", hint: "Email, password, Google", icon: ShieldIcon },
];

export const accountSectionHref = (s: AccountSection) => `/me/account?section=${s.slug}`;

export function sectionFromSlug(slug: string | undefined): AccountSection | null {
  return ACCOUNT_SECTIONS.find((s) => s.slug === slug) ?? null;
}
