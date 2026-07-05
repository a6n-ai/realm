import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { isLocked } from "@/lib/auth/lock";
import { AuthForm } from "./auth-form";

export default async function LoginPage() {
  const session = await getSession();
  // A lock cookie is only ever set for a user who has a PIN (LockButton guards
  // it), so a locked session ⇒ PIN is available. No extra DB read needed.
  const canUsePin = Boolean(session?.user) && (await isLocked());
  return (
    <Suspense>
      <AuthForm canUsePin={canUsePin} />
    </Suspense>
  );
}
