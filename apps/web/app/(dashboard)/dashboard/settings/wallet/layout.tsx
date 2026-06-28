import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/guards";

export default async function WalletLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <div className="grid gap-6">{children}</div>;
}
