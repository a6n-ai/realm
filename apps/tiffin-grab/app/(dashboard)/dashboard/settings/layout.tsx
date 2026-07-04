import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell } from "@/components/ds";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <PageShell>{children}</PageShell>;
}
