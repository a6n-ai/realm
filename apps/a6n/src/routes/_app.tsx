import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { getShell } from "../lib/auth/shell.fns";

// Console code loads only for signed-in visitors, so the login page ships none of it.
const ConsoleLayout = lazy(() => import("../components/console-layout"));

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const shell = await getShell();
    if (!shell) throw redirect({ to: "/login", search: { redirect: location.href } });
    if (!shell.user.passwordSet) throw redirect({ to: "/set-password" });
    // No organisation: only a super admin may stay, and only on the platform page.
    if (!shell.organization && !(shell.platformAdmin && location.pathname.startsWith("/admin"))) {
      throw redirect({ to: shell.platformAdmin ? "/admin" : "/no-organization" });
    }
    return { shell };
  },
  component: () => {
    const { shell } = Route.useRouteContext();
    return (
      <Suspense fallback={null}>
        <ConsoleLayout shell={shell} />
      </Suspense>
    );
  },
});
