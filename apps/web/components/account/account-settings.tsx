import type { ReactNode } from "react";
import type { Country as CountryCode } from "react-phone-number-input";
import type { RoleValue } from "@tiffin/commons";
import { SECTION_GROUPS, type SectionKey } from "./sections.config";
import { SectionGroup } from "./section-group";
import { ProfileSection } from "./sections/profile-section";
import { ContactSection } from "./sections/contact-section";
import { AddressSection } from "./sections/address-section";
import { DietarySection } from "./sections/dietary-section";
import { DeliveryNotesSection } from "./sections/delivery-notes-section";
import { NotificationsSection } from "./sections/notifications-section";
import { PinSection } from "./sections/pin-section";
import { PasswordSection } from "./sections/password-section";

// The subset of the user row the account surface renders. Stays plain and
// serializable so this server component never reaches for authClient.
export interface AccountUser {
  image: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  emailVerified: boolean | null;
  pinHash: string | null;
  addressLine: string | null;
  addressUnit: string | null;
  city: string | null;
  postalCode: string | null;
  province: string | null;
  dietaryNotes: string | null;
  allergens: string | null;
  deliveryNotes: string | null;
  notifyEmail: boolean | null;
  notifySms: boolean | null;
}

function splitAllergens(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function AccountSettings({
  role,
  user,
  defaultCountry,
}: {
  role: RoleValue;
  user: AccountUser;
  defaultCountry: CountryCode;
}) {
  const groups = SECTION_GROUPS[role] ?? [];

  const render: Record<SectionKey, ReactNode> = {
    profile: <ProfileSection image={user.image} name={user.name} />,
    contact: (
      <ContactSection
        phone={user.phone ?? ""}
        email={user.email ?? ""}
        emailVerified={user.emailVerified ?? false}
        defaultCountry={defaultCountry}
      />
    ),
    address: (
      <AddressSection
        addressLine={user.addressLine ?? ""}
        addressUnit={user.addressUnit ?? ""}
        city={user.city ?? ""}
        postalCode={user.postalCode ?? ""}
        province={user.province ?? ""}
      />
    ),
    dietary: (
      <DietarySection
        dietaryNotes={user.dietaryNotes ?? ""}
        allergens={splitAllergens(user.allergens)}
      />
    ),
    deliveryNotes: <DeliveryNotesSection deliveryNotes={user.deliveryNotes ?? ""} />,
    notifications: (
      <NotificationsSection
        notifyEmail={user.notifyEmail ?? true}
        notifySms={user.notifySms ?? false}
      />
    ),
    pin: <PinSection hasPin={Boolean(user.pinHash)} />,
    password: <PasswordSection />,
  };

  return (
    <div className="max-w-2xl space-y-10">
      {groups.map((group, i) => (
        <SectionGroup key={group.heading ?? `group-${i}`} heading={group.heading}>
          {group.sections.map((key) => (
            <div key={key}>{render[key]}</div>
          ))}
        </SectionGroup>
      ))}
    </div>
  );
}
