import { OrbLoading } from "@/components/customer/orb-loading";

// The customer app waits on the thinking orb, not a skeleton (components/customer/orb-loading.tsx).
export default function Loading() {
  return <OrbLoading />;
}
