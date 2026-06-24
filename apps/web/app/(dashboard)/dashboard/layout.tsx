import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NotFoundError } from "@tiffin/commons";
import { getSession } from "@/lib/auth/session";
import { isLocked } from "@/lib/auth/lock";
import { usersService } from "@/lib/services/users.service";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { IdleLock } from "@/components/dashboard/idle-lock";
import { LockButton } from "@/components/dashboard/lock-button";
import { UserMenu } from "@/components/dashboard/user-menu";
import { ModeToggle } from "@/components/mode-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

// Any authenticated user reaches the shell; the sidebar filters nav by role and
// staff/admin-only pages self-guard (requireStaff/requireAdmin). Customers use
// it for the account page.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  // One read covers PIN state + the header avatar (name/image). A session can
  // outlive its user row (e.g. dev DB reseeded) — treat that as expired.
  let user;
  try {
    user = await usersService.read(session.user.id);
  } catch (err) {
    if (err instanceof NotFoundError) redirect("/login");
    throw err;
  }
  const hasPin = Boolean(user.pinHash);
  if (hasPin && (await isLocked())) redirect("/lock");

  const role = session.user.role;
  const email = user.email ?? session.user.email ?? "";

  return (
    <SidebarProvider>
      <AppSidebar user={{ email, role }} hasPin={hasPin} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium">Dashboard</span>
          <div className="ml-auto flex items-center gap-1">
            {hasPin && <LockButton />}
            <ModeToggle />
            <UserMenu user={{ email, role, name: user.name ?? null, image: user.image ?? null }} hasPin={hasPin} />
          </div>
        </header>
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
      {hasPin && <IdleLock />}
    </SidebarProvider>
  );
}
