import { Suspense } from "react";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { requireAccountUser } from "@/app/(dashboard)/dashboard/account/current-user";
import { ProfileSection } from "@/components/account/sections/profile-section";
import { ContactSection } from "@/components/account/sections/contact-section";
import { AddressSection, AddressSectionSkeleton } from "@/components/account/sections/address-section";
import { DietarySection } from "@/components/account/sections/dietary-section";
import { DietarySectionSkeleton } from "@/app/(dashboard)/dashboard/account/dietary/dietary-section-skeleton";
import { NotificationsSection } from "@/components/account/sections/notifications-section";
import { NotificationsSectionSkeleton } from "@/app/(dashboard)/dashboard/account/notifications/notifications-section-skeleton";

// Customer-facing self-service, composed from the same tested account sections
// the CRM dashboard used before /dashboard/account/* was gated to staff. Each
// section is session-scoped via requireAccountUser() (not requireSectionAccess,
// which redirects into /dashboard/account/* — wrong for this app).
export default function MeProfilePage() {
  return (
    <main className="space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Profile</h1>
        <p className="text-muted-foreground text-sm">Your account, contact, address, and preferences.</p>
      </header>

      <Suspense fallback={<ProfileSection.Skeleton />}>
        <ProfileData />
      </Suspense>

      <Suspense fallback={<ContactSection.Skeleton />}>
        <ContactData />
      </Suspense>

      <Suspense fallback={<AddressSectionSkeleton />}>
        <AddressData />
      </Suspense>

      <Suspense fallback={<DietarySectionSkeleton />}>
        <DietaryData />
      </Suspense>

      <Suspense fallback={<NotificationsSectionSkeleton />}>
        <NotificationsData />
      </Suspense>
    </main>
  );
}

async function ProfileData() {
  const { user } = await requireAccountUser();
  return (
    <ProfileSection
      image={user.image ?? null}
      name={user.name ?? null}
      username={user.displayUsername ?? user.username ?? null}
    />
  );
}

async function ContactData() {
  const [{ user }, { defaultCountry }] = await Promise.all([requireAccountUser(), getAppSettings()]);
  return (
    <ContactSection
      phone={user.phone ?? ""}
      email={user.email ?? ""}
      emailVerified={user.emailVerified ?? false}
      phoneVerified={user.phoneVerified ?? false}
      defaultCountry={defaultCountry}
    />
  );
}

async function AddressData() {
  const { user } = await requireAccountUser();
  return (
    <AddressSection
      addressLine={user.addressLine ?? ""}
      addressUnit={user.addressUnit ?? ""}
      city={user.city ?? ""}
      postalCode={user.postalCode ?? ""}
      province={user.province ?? ""}
    />
  );
}

function splitAllergens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function DietaryData() {
  const { user } = await requireAccountUser();
  return (
    <DietarySection
      dietaryNotes={user.dietaryNotes ?? ""}
      allergens={splitAllergens(user.allergens)}
    />
  );
}

async function NotificationsData() {
  const { user } = await requireAccountUser();
  return (
    <NotificationsSection
      notifyEmail={user.notifyEmail ?? true}
      notifySms={user.notifySms ?? false}
    />
  );
}
