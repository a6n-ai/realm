import { createFileRoute } from "@tanstack/react-router";
import { ChangePasswordForm } from "../../components/auth/change-password-form";
import { SettingsCard } from "../../components/page/settings-card";
import { PageHeader } from "../../components/shell/page-header";

export const Route = createFileRoute("/_app/account")({ component: AccountPage });

function AccountPage() {
  const { shell } = Route.useRouteContext();
  return (
    <>
      <PageHeader crumbs={[{ label: "Account" }]} description={`${shell.user.name} · ${shell.user.email}`} />
      <div className="max-w-2xl px-4 pb-8">
        <SettingsCard title="Change password" description="Other sessions are signed out when you change it.">
          <div className="max-w-md">
            <ChangePasswordForm email={shell.user.email} />
          </div>
        </SettingsCard>
      </div>
    </>
  );
}
