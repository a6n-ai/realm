import type { ReactNode } from "react";
import { hasFlag } from "@/lib/flags";

export async function FeatureGate({
  userId,
  flag,
  children,
}: {
  userId: string;
  flag: string;
  children: ReactNode;
}) {
  const enabled = await hasFlag(userId, flag);
  return enabled ? <>{children}</> : null;
}
