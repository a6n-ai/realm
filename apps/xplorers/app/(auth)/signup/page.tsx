import { Suspense } from "react";
import { googleSignInEnabled } from "@foundry/auth";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm googleEnabled={googleSignInEnabled()} />
    </Suspense>
  );
}
