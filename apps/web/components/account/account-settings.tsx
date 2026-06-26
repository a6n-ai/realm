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

  // Card titles nest one level below a labelled group heading (h2 -> h3); cards
  // in an unheaded group sit directly under the page h1 and stay h2.
  function renderSection(key: SectionKey, titleAs: "h2" | "h3"): ReactNode {
    switch (key) {
      case "profile":
        return <ProfileSection image={user.image} name={user.name} titleAs={titleAs} />;
      case "contact":
        return (
          <ContactSection
            phone={user.phone ?? ""}
            email={user.email ?? ""}
            emailVerified={user.emailVerified ?? false}
            defaultCountry={defaultCountry}
            titleAs={titleAs}
          />
        );
      case "address":
        return (
          <AddressSection
            addressLine={user.addressLine ?? ""}
            addressUnit={user.addressUnit ?? ""}
            city={user.city ?? ""}
            postalCode={user.postalCode ?? ""}
            province={user.province ?? ""}
            titleAs={titleAs}
          />
        );
      case "dietary":
        return (
          <DietarySection
            dietaryNotes={user.dietaryNotes ?? ""}
            allergens={splitAllergens(user.allergens)}
            titleAs={titleAs}
          />
        );
      case "deliveryNotes":
        return <DeliveryNotesSection deliveryNotes={user.deliveryNotes ?? ""} titleAs={titleAs} />;
      case "notifications":
        return (
          <NotificationsSection
            notifyEmail={user.notifyEmail ?? true}
            notifySms={user.notifySms ?? false}
            titleAs={titleAs}
          />
        );
      case "pin":
        return <PinSection hasPin={Boolean(user.pinHash)} titleAs={titleAs} />;
      case "password":
        return <PasswordSection titleAs={titleAs} />;
    }
  }

  return (
    <div className="max-w-2xl space-y-10">
      {groups.map((group, i) => (
        <SectionGroup key={group.heading ?? `group-${i}`} heading={group.heading}>
          {group.sections.map((key) => (
            <div key={key}>{renderSection(key, group.heading ? "h3" : "h2")}</div>
          ))}
        </SectionGroup>
      ))}
    </div>
  );
}
