import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@foundry/console/page-header";
import { ChangePasswordForm } from "../../components/auth/change-password-form";

export const Route = createFileRoute("/_app/account")({ component: AccountPage });

function AccountPage() {
  const { shell } = Route.useRouteContext();
  return (
    <>
      <PageHeader crumbs={[{ label: "Account" }]} description={`${shell.user.name} · ${shell.user.email}`} />
      <section className="grid max-w-md gap-4 px-4 pb-8">
        <h2 className="text-lg font-semibold">Change password</h2>
        <ChangePasswordForm email={shell.user.email} />
      </section>
    </>
  );
}
