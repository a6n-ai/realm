import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/guards";
import { PageShell } from "@/components/ds";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requirePermission({ settings: ["read"] });
  return <PageShell>{children}</PageShell>;
}
