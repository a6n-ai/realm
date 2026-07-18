"use client";

import { useRouter } from "next/navigation";
import { ChangeEmailForm as SharedChangeEmailForm } from "@realm/auth-ui";
import { authClient } from "@/lib/auth/client";

/** App wiring for the shared OTP change-email form. */
export function ChangeEmailForm({ currentEmail }: { currentEmail?: string | null }) {
  const router = useRouter();
  return (
    <SharedChangeEmailForm
      currentEmail={currentEmail}
      onSendCurrentOtp={() =>
        currentEmail
          ? authClient.emailOtp.sendVerificationOtp({ email: currentEmail, type: "email-verification" })
          : Promise.resolve({ error: { message: "No current email on file" } })
      }
      onRequestChange={({ newEmail, otp }) => authClient.emailOtp.requestEmailChange({ newEmail, otp })}
      onConfirmChange={({ newEmail, otp }) => authClient.emailOtp.changeEmail({ newEmail, otp })}
      onSuccess={() => router.refresh()}
    />
  );
}
