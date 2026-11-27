import { Outlet } from "@tanstack/react-router";
import type { Shell } from "../lib/auth/shell";
import { visibleNav } from "./nav";
import { AppShell } from "./shell/app-shell";
import { CreateProvider } from "./shell/create-dialogs";
import { FindPalette } from "./shell/find-palette";
import { OrgSwitcher } from "./shell/org-switcher";
import { UserMenu } from "./shell/user-menu";

export default function ConsoleLayout({ shell }: { shell: Shell }) {
  return (
    <CreateProvider>
      <AppShell nav={visibleNav(shell.permissions, shell.unassigned, shell.platformAdmin)} brand={<OrgSwitcher shell={shell} />} find={<FindPalette permissions={shell.permissions} />} userMenu={<UserMenu name={shell.user.name} email={shell.user.email} />}>
        <Outlet />
      </AppShell>
    </CreateProvider>
  );
}
