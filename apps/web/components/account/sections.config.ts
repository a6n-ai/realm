import { Role, type RoleValue } from "@tiffin/commons";

export type SectionKey =
  | "profile"
  | "contact"
  | "address"
  | "dietary"
  | "deliveryNotes"
  | "notifications"
  | "pin"
  | "password";

export interface SectionGroupSpec {
  heading?: string;
  sections: SectionKey[];
}

// SINGLE SOURCE OF TRUTH for role gating. A role omits the groups/sections it
// lacks; it never reorders them. PIN exists only in the staff branch; the
// delivery sections exist only in the user branch — there is no shared card
// that conditionally renders a role-specific field, so there is no leak path.
const STAFF_GROUPS: SectionGroupSpec[] = [
  { sections: ["profile", "contact"] },
  { heading: "Security", sections: ["pin", "password"] },
];

export const SECTION_GROUPS: Record<RoleValue, SectionGroupSpec[]> = {
  [Role.ADMIN]: STAFF_GROUPS,
  [Role.MEMBER]: STAFF_GROUPS,
  [Role.USER]: [
    { sections: ["profile", "contact"] },
    {
      heading: "Delivery",
      sections: ["address", "dietary", "deliveryNotes", "notifications"],
    },
    { heading: "Security", sections: ["password"] },
  ],
};

export const SECTION_META: Record<SectionKey, { id: string; title: string; subtitle?: string }> = {
  profile: { id: "profile", title: "Profile" },
  contact: { id: "contact", title: "Contact" },
  address: { id: "address", title: "Delivery address" },
  dietary: { id: "dietary", title: "Dietary & allergens" },
  deliveryNotes: { id: "delivery-notes", title: "Delivery notes" },
  notifications: { id: "notifications", title: "Notifications" },
  pin: { id: "pin", title: "PIN" },
  password: { id: "password", title: "Password" },
};
