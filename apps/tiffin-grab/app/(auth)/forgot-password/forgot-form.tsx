"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AUTH_LINK, AuthPanel, AuthScreen, ForgotPasswordForm } from "@foundry/auth-ui";
import { authClient } from "@/lib/auth/client";
import { AuthLegal, AuthLogo, tiffinAuthUi } from "@/components/auth/auth-kit";

export function ForgotForm() {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "verify">("request");

  return (
    <AuthScreen footer={<AuthLegal />}>
      <AuthPanel
        art={<AuthLogo />}
        title={step === "request" ? "Reset your password" : "Enter the code"}
        tagline={step === "request" ? "Enter your email and we'll send you a code." : "Not in your inbox? Check your spam folder. Then choose a new password."}
      >
        <div className="flex flex-1 flex-col">
          <ForgotPasswordForm
            compact
            ui={tiffinAuthUi}
            onStepChange={setStep}
            onSendEmailOtp={(email) => authClient.emailOtp.requestPasswordReset({ email })}
            onResetWithEmailOtp={({ email, otp, password }) => authClient.emailOtp.resetPassword({ email, otp, password })}
            onSuccess={() => router.push("/login")}
          />
          <div className="flex flex-col items-center">
            <Link href="/login" className={`${AUTH_LINK} inline-flex items-center`}>Back to sign in</Link>
          </div>
        </div>
      </AuthPanel>
    </AuthScreen>
  );
}
