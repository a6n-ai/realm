import { OrbLoading } from "@/components/customer/orb-loading";

// Deliveries (/me) gets its own boundary: /me/loading.tsx wraps every customer page and is already on screen
// when a tab navigates back to /me, so Next.js would not show it and the old page sat frozen meanwhile.
export default function Loading() {
  return <OrbLoading />;
}
