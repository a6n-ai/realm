import { ForgotPasswordForm } from "@foundry/auth-ui";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AUTH_QUIET_LINK, AuthCard, appAuthUi } from "../components/auth/auth-kit";
import { authClient } from "../lib/auth/client";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"request" | "verify">("request");
  return (
    <AuthCard
      title={step === "request" ? "Reset your password" : "Enter the code"}
      text={step === "request" ? "Enter your email and we will send you a code." : "Then choose a new password."}
    >
          <ForgotPasswordForm
            compact
            ui={appAuthUi}
            onStepChange={setStep}
            onSendEmailOtp={(email) => authClient.emailOtp.requestPasswordReset({ email })}
            onResetWithEmailOtp={({ email, otp, password }) => authClient.emailOtp.resetPassword({ email, otp, password })}
            onSuccess={() => void navigate({ to: "/login" })}
          />
          <Link to="/login" className={AUTH_QUIET_LINK}>
            Back to log in
          </Link>
    </AuthCard>
  );
}
