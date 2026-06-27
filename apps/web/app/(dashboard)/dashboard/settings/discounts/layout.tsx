import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { DiscountsTabs } from "./discounts-tabs";

// Discounts is its own multi-page section nested under the settings shell: the
// settings layout supplies the page header + top tabs, this layout adds the
// secondary sub-tab row. Admin-only (defense in depth alongside the settings
// layout guard); each sub-page loads its own projected data.
export default async function DiscountsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="grid gap-6">
      <DiscountsTabs />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
