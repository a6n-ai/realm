"use client";

import { ChangePasswordForm as SharedChangePasswordForm } from "@foundry/auth-ui";
import { authClient, useSession } from "@/lib/auth/client";

export function ChangePasswordForm() {
  const { data: session } = useSession();
  const email = session?.user?.email;

  return (
    <SharedChangePasswordForm
      onChangePassword={({ currentPassword, newPassword }) =>
        authClient.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        })
      }
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
