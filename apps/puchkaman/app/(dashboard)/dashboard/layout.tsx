import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  return <AdminShell user={{ email: session.user.email }}>{children}</AdminShell>;
}
