import type { ReactNode } from "react";
import { requirePagePermission } from "@/lib/auth/guards";
import { PageShell } from "@/components/ds";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requirePagePermission({ settings: ["read"] });
  return <PageShell>{children}</PageShell>;
}
