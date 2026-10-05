import type { ReactNode } from "react";
import { PageShell } from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { DiscountsHeader } from "./discounts-header";

export default async function DiscountsLayout({ children }: { children: ReactNode }) {
  await requirePermission({ discount: ["read"] });
  return (
    <PageShell>
      <DiscountsHeader />
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}
