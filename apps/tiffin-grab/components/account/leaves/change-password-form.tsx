"use client";

import { ChangePasswordForm as SharedChangePasswordForm } from "@realm/auth-ui";
import { authClient } from "@/lib/auth/client";

/** App wiring for the shared change-password form. */
export function ChangePasswordForm() {
  return (
    <SharedChangePasswordForm
      onChangePassword={({ currentPassword, newPassword }) =>
        authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
      }
    />
  );
}
