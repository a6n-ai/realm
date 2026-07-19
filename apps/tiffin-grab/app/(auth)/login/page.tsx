import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isLocked } from "@/lib/auth/lock";
import { roleLanding } from "@/lib/auth/landing";
import { AuthForm } from "./auth-form";

// Reads session from the DB — must not be statically prerendered at build
// time (no DB in the build container).
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  // A lock cookie is only ever set for a user who has a PIN (LockButton guards
  // it), so a locked session ⇒ PIN is available. No extra DB read needed.
  const locked = Boolean(session?.user) && (await isLocked());
  // Already signed in and NOT locked → skip the form, go straight to the role's
  // home. A locked session stays on /login to enter its PIN.
  if (session?.user && !locked) redirect(roleLanding(session.user.role));
  const canUsePin = locked;
  return (
    <Suspense>
      <AuthForm canUsePin={canUsePin} />
    </Suspense>
  );
}
