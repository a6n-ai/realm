import type { ReactNode } from "react";
import { CoinsIcon } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guards";
import { PageShell, PageHeader } from "@/components/ds";
import { WalletTabs } from "./wallet-tabs";

export default async function WalletLayout({ children }: { children: ReactNode }) {
  await requirePagePermission({ wallet: ["read"] });

  return (
    <PageShell>
      <PageHeader icon={CoinsIcon} title="Wallet" />
      <WalletTabs />
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}
