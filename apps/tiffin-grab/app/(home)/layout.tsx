import type { ReactNode } from "react";
import { PublicShell } from "@/components/landing/public-shell";

export default function HomeLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
