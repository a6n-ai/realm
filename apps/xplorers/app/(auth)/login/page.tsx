import { Suspense } from "react";
import { cookies } from "next/headers";
import { LAST_USER_COOKIE, googleSignInEnabled, maskEmail, parseLastUser } from "@foundry/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const last = parseLastUser((await cookies()).get(LAST_USER_COOKIE)?.value);
  return (
    <Suspense>
      <LoginForm
        googleClientId={googleSignInEnabled() ? process.env.GOOGLE_CLIENT_ID! : null}
        lastUser={last ? { ...last, maskedEmail: maskEmail(last.email) } : null}
      />
    </Suspense>
  );
}
