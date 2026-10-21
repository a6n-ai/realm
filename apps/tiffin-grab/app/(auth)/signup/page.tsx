import { Suspense } from "react";
import { cookies } from "next/headers";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { REFERRAL_COOKIE } from "@/lib/referrals/cookie";
import { SignupForm } from "./signup-form";

// Reads runtime app-settings (defaultCountry) from the DB — must not be
// statically prerendered at build time (no DB in the build container).
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const [{ defaultCountry }, jar] = await Promise.all([getAppSettings(), cookies()]);
  return (
    <Suspense>
      <SignupForm defaultCountry={defaultCountry} defaultReferralCode={jar.get(REFERRAL_COOKIE)?.value ?? ""} />
    </Suspense>
  );
}
