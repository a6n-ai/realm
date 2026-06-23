import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth/session";
import { isLocked } from "@/lib/auth/lock";
import { usersService } from "@/lib/services/users.service";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { IdleLock } from "@/components/dashboard/idle-lock";
import { ModeToggle } from "@/components/mode-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

// Any authenticated user reaches the shell; the sidebar filters nav by role and
// staff/admin-only pages self-guard (requireStaff/requireAdmin). Customers use
// it for the account page.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const hasPin = await usersService.hasPin(session.user.id);
  if (hasPin && (await isLocked())) redirect("/lock");

  return (
    <SidebarProvider>
      <AppSidebar user={{ email: session.user.email ?? "", role: session.user.role }} hasPin={hasPin} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium">Dashboard</span>
          <div className="ml-auto">
            <ModeToggle />
          </div>
        </header>
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
      {hasPin && <IdleLock />}
    </SidebarProvider>
  );
}
