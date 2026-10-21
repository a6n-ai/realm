import type { ReactNode } from "react";
import { PublicShell } from "@/components/landing/public-shell";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
