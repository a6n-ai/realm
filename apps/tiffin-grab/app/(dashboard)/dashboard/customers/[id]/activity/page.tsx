import { SectionCard } from "@/components/ds";
import { CustomerTimeline } from "../customer-timeline";
import { loadCustomer, loadViewer } from "../data";

/** Activity tab: everything that happened on this customer's account and orders, newest first. */
export default async function CustomerActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, { timezone }] = await Promise.all([loadCustomer(id), loadViewer()]);
  return (
    <SectionCard title="Activity timeline">
      <CustomerTimeline entries={data.timeline} timezone={timezone} />
    </SectionCard>
  );
}
