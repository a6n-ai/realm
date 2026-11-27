import { ConsoleLink, useConsoleRouter } from "@foundry/console/router";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { allows } from "../../lib/auth/permissions";
import { PageHeader } from "../../components/shell/page-header";

export const Route = createFileRoute("/_app/settings")({ component: SettingsLayout });

function SettingsLayout() {
  const { shell } = Route.useRouteContext();
  const pathname = useConsoleRouter().usePathname().replace(/\/$/, "");
  const tabs = [
    { to: "/settings", label: "General" },
    ...(allows(shell.user.role, "team:manage") ? [{ to: "/settings/members", label: "Members" }] : []),
    { to: "/settings/account", label: "Account" },
  ];
  const tab = tabs.find((t) => t.to === pathname);
  return (
    <>
      <PageHeader title="Settings" crumbs={[{ label: "Settings" }, ...(tab ? [{ label: tab.label }] : [])]} />
      <div className="grid gap-6 px-4 pb-8 md:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="Settings" className="flex gap-1 overflow-x-auto md:flex-col">
          {tabs.map((t) => (
            <ConsoleLink
              key={t.to}
              to={t.to}
              aria-current={pathname === t.to ? "page" : undefined}
              data-active={pathname === t.to}
              className="inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-muted data-[active=true]:font-medium data-[active=true]:text-foreground"
            >
              {t.label}
            </ConsoleLink>
          ))}
        </nav>
        <div className="grid min-w-0 content-start gap-6">
          <Outlet />
        </div>
      </div>
    </>
  );
}
