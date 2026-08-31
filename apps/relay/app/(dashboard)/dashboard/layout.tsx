import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CrmShell } from "@foundry/crm";
import { getSession } from "@/lib/auth/session";
import { RelaySidebar } from "@/components/relay-sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return (
    <CrmShell
      sidebar={<RelaySidebar email={session.user.email} />}
      breadcrumbs={<span className="text-sm text-muted-foreground">Relay</span>}
    >
      {children}
    </CrmShell>
  );
}
