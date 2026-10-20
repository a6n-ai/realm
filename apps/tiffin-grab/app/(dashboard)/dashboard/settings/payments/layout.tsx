import type { ReactNode } from "react";
import { BanknoteIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ds";

export default async function PaymentsSettingsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="grid gap-6">
      <PageHeader
        icon={BanknoteIcon}
        title="Payment"
        subtitle="Providers customers can pay with, and the tax and coin rules every order follows."
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
