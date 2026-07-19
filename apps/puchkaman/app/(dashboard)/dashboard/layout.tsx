import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/admin-shell";
// Scoped to /dashboard only — see the file's header comment for why.
import "./dashboard-tailwind.css";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  // First-login gate: an account still on its issued default password must set
  // its own before it can reach anything under /dashboard. /set-password sits
  // outside this layout so it can't trap the user.
  const [u] = await db
    .select({ passwordSet: users.passwordSet })
    .from(users)
    .where(eq(users.publicId, session.user.id))
    .limit(1);
  if (!u) redirect("/login");
  if (!u.passwordSet) redirect("/set-password");

  return <AdminShell user={{ email: session.user.email }}>{children}</AdminShell>;
}
