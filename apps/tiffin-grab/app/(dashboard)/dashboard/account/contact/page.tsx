import { Suspense } from "react";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { ContactSection } from "@/components/account/sections/contact-section";
import { requireAccountUser } from "../current-user";

export default function AccountContactPage() {
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
