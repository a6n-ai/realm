import type { ReactNode } from "react";
import { BanknoteIcon } from "lucide-react";
import { PageHeader } from "@/components/ds";

// Admin gate lives on settings/layout — no second requireAdmin here.
export default async function PaymentsSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6">
      <PageHeader
        icon={BanknoteIcon}
        title="Payment"
        subtitle="How customers pay at checkout, and the tax rules every order follows."
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
