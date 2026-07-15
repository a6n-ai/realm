import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { isLocked } from "@/lib/auth/lock";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { AuthForm } from "./auth-form";

// Reads runtime app-settings (defaultCountry) + session from the DB — must not
// be statically prerendered at build time (no DB in the build container).
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const [session, { defaultCountry }] = await Promise.all([getSession(), getAppSettings()]);
  // A lock cookie is only ever set for a user who has a PIN (LockButton guards
  // it), so a locked session ⇒ PIN is available. No extra DB read needed.
  const canUsePin = Boolean(session?.user) && (await isLocked());
  return (
    <Suspense>
      <AuthForm canUsePin={canUsePin} defaultCountry={defaultCountry} />
    </Suspense>
  );
}
