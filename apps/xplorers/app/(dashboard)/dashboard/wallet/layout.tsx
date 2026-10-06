import type { ReactNode } from "react";
import { WalletIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { WalletTabs } from "./wallet-tabs";

export default async function WalletLayout({ children }: { children: ReactNode }) {
  await requirePermission({ wallet: ["read"] });
  return (
    <PageShell>
      <PageHeader icon={WalletIcon} title="Wallet" subtitle="Coins families earn and spend on bookings." />
      <WalletTabs />
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}
