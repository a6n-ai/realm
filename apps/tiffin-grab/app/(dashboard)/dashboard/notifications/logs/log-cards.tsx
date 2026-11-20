import type { ReactNode } from "react";
import { SectionCard } from "@/components/ds";

export function SendsCard({ children }: { children: ReactNode }) {
  return (
    <SectionCard title="Notification log" subtitle="Every event-driven send, newest first.">
      {children}
    </SectionCard>
  );
}

export function ActivityCard({ children }: { children: ReactNode }) {
  return (
    <SectionCard
      title="Customer activity"
      subtitle="Address changes, meal picks, holds, reschedules, and other saved customer actions — by the customer, admin, or system."
    >
      {children}
    </SectionCard>
  );
}
