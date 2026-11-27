import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { AuthCard, appAuthUi } from "../components/auth/auth-kit";
import { authClient } from "../lib/auth/client";
import { getShell } from "../lib/auth/shell.fns";

export const Route = createFileRoute("/no-organization")({
  beforeLoad: async () => {
    const shell = await getShell();
    if (!shell) throw redirect({ to: "/login" });
    if (shell.organization) throw redirect({ to: "/inquiries" });
  },
  component: NoOrganization,
});

function NoOrganization() {
  const router = useRouter();
  const Button = appAuthUi.Button!;
  return (
    <AuthCard title="No organisation" text="You are not a member of any organisation yet. Ask an owner to invite you, then sign in again.">
      <Button
        onClick={async () => {
          await authClient.signOut();
          await router.navigate({ to: "/login" });
        }}
      >
        Sign out
      </Button>
    </AuthCard>
  );
}
