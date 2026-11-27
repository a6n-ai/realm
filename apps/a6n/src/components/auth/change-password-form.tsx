import { ChangePasswordForm as SharedChangePasswordForm } from "@foundry/auth-ui";
import { authClient } from "../../lib/auth/client";
import { appAuthUi } from "./auth-kit";

export function ChangePasswordForm({ email }: { email: string }) {
  return (
    <SharedChangePasswordForm
      ui={appAuthUi}
      onChangePassword={({ currentPassword, newPassword }) =>
        authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
      }
      forgotCurrent={{
        email,
        onSendEmailOtp: (to) => authClient.emailOtp.requestPasswordReset({ email: to }),
        onResetWithEmailOtp: ({ email: to, otp, password }) => authClient.emailOtp.resetPassword({ email: to, otp, password }),
      }}
    />
  );
}
