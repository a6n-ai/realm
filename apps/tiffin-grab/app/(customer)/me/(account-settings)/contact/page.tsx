import { Suspense } from "react";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { requireAccountUser } from "@/app/(dashboard)/dashboard/account/current-user";
import { ContactSection } from "@/components/account/sections/contact-section";

export default function MeContactPage() {
  return (
    <Suspense fallback={<ContactSection.Skeleton />}>
      <ContactData />
    </Suspense>
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
