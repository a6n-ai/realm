import { Suspense } from "react";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const { defaultCountry } = await getAppSettings();
  return (
    <Suspense>
      <SignupForm defaultCountry={defaultCountry} />
    </Suspense>
  );
}
