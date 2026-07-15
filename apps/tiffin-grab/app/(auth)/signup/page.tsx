import { Suspense } from "react";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { SignupForm } from "./signup-form";

// Reads runtime app-settings (defaultCountry) from the DB — must not be
// statically prerendered at build time (no DB in the build container).
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const { defaultCountry } = await getAppSettings();
  return (
    <Suspense>
      <SignupForm defaultCountry={defaultCountry} />
    </Suspense>
  );
}
