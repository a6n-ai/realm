import { tzToDefaultCountry } from "@tiffin/commons";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { ContactSection } from "@/components/account/sections/contact-section";
import { requireAccountUser } from "../current-user";

export default async function AccountContactPage() {
  const [{ user }, { timezone }] = await Promise.all([requireAccountUser(), getAppSettings()]);
  const defaultCountry = tzToDefaultCountry(timezone);
  return (
    <ContactSection
      phone={user.phone ?? ""}
      email={user.email ?? ""}
      emailVerified={user.emailVerified ?? false}
      defaultCountry={defaultCountry}
    />
  );
}
