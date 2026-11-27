import { createFileRoute } from "@tanstack/react-router";
import { ChangePasswordForm } from "../../../components/auth/change-password-form";
import { SettingsCard } from "../../../components/page/settings-card";

export const Route = createFileRoute("/_app/settings/account")({ component: AccountPage });

function AccountPage() {
  const { shell } = Route.useRouteContext();
  return (
    <SettingsCard title="Change password" description="Other sessions are signed out when you change it.">
      <div className="max-w-md">
        <ChangePasswordForm email={shell.user.email} />
      </div>
    </SettingsCard>
  );
}
