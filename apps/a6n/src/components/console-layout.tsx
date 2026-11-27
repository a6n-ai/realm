import { Link, Outlet } from "@tanstack/react-router";
import { AppMark } from "./auth/auth-kit";
import type { Shell } from "../lib/auth/shell";
import { visibleNav } from "./nav";
import { AppShell } from "./shell/app-shell";
import { CreateProvider } from "./shell/create-dialogs";
import { FindPalette } from "./shell/find-palette";
import { UserMenu } from "./shell/user-menu";

function Brand() {
  return (
    <Link to="/inquiries" className="flex h-9 items-center gap-2 px-2 font-semibold text-(--strong)">
      <AppMark className="size-6" />
      <span className="group-data-[collapsible=icon]:hidden">a6n</span>
    </Link>
  );
}

export default function ConsoleLayout({ shell }: { shell: Shell }) {
  return (
    <CreateProvider>
      <AppShell nav={visibleNav(shell.user.role, shell.unassigned)} brand={<Brand />} find={<FindPalette role={shell.user.role} />} userMenu={<UserMenu name={shell.user.name} />}>
        <Outlet />
      </AppShell>
    </CreateProvider>
  );
}
