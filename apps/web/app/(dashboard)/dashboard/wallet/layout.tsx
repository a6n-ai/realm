import type { ReactNode } from "react";
import { CoinsIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ds";
import { WalletTabs } from "./wallet-tabs";

export default async function WalletLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="grid gap-6">
      <PageHeader icon={CoinsIcon} title="Wallet" />
      <WalletTabs />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
