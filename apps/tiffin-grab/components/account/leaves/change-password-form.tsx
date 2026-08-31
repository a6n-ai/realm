"use client";

import { ChangePasswordForm as SharedChangePasswordForm } from "@foundry/auth-ui";
import { authClient, useSession } from "@/lib/auth/client";

/** App wiring for the shared change-password form. */
export function ChangePasswordForm() {
  const { data: session } = useSession();
  const email = session?.user?.email;

  return (
    <SharedChangePasswordForm
      onChangePassword={({ currentPassword, newPassword }) =>
        authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
      }
      // The escape hatch only appears once the session's email is known — it is
      // the address the code goes to, and it is never typed by the user, so
      // there is nothing here to enumerate.
      forgotCurrent={
        email
          ? {
              email,
              onSendEmailOtp: (to) => authClient.emailOtp.requestPasswordReset({ email: to }),
              onResetWithEmailOtp: ({ email: to, otp, password }) =>
                authClient.emailOtp.resetPassword({ email: to, otp, password }),
            }
          : undefined
      }
    />
  );
}
