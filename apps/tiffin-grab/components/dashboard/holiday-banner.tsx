import { SectionCard } from "@/components/ds";

/** Shown on a day page so an empty day is not mistaken for a fault. Renders nothing on an open day. */
export function HolidayBanner({ closed }: { closed: { name: string; organizationName: string }[] }) {
  if (closed.length === 0) return null;
  return (
    <SectionCard title="Holiday">
      <p className="text-sm" data-testid="holiday-banner">
        Holiday: {closed.map((h) => (closed.length > 1 ? `${h.name} (${h.organizationName})` : h.name)).join(", ")}. Kitchen closed. Deliveries for this day are paused and added back at the end of each plan.
      </p>
    </SectionCard>
  );
}
