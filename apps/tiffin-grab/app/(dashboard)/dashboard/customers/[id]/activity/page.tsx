import { SectionCard } from "@/components/ds";
import { listCustomerOrderActivities } from "@/lib/services/orders.service";
import { OrderActivityLog, type OrderActivityLogRow } from "../../../orders/[id]/order-activity-log";
import { CUSTOMER_ACTIVITY_FACETS } from "../../../orders/[id]/activity-facets";
import { loadCustomer } from "../data";

const ACCOUNT_TYPE = { address: "account_address", wallet: "account_wallet", inquiry: "account_inquiry" } as const;

/** Activity tab: the order page's log across every order of this customer, plus account events (addresses, coins, inquiries). */
export default async function CustomerActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadCustomer(id);
  const orderRows = await listCustomerOrderActivities(data.profile.id);

  const rows: OrderActivityLogRow[] = [
    ...orderRows.map(({ orderPublicId, deploymentId, ...r }) => ({ ...r, order: { publicId: orderPublicId, label: deploymentId } })),
    // Order creation is already in the order log; the rest belong to the account, not an order.
    ...data.timeline.flatMap((e) =>
      e.kind === "order"
        ? []
        : [{
            publicId: e.id,
            type: ACCOUNT_TYPE[e.kind],
            note: e.label,
            fromStatus: null,
            toStatus: null,
            createdAt: e.at,
            createdBy: null,
            actorName: null,
            actorEmail: null,
            actorRole: null,
            noActor: true,
          }],
    ),
  ];

  return (
    <SectionCard title="Activity" subtitle="Every change on this customer's orders and account, by staff, the customer or the system.">
      <OrderActivityLog activities={rows} facets={CUSTOMER_ACTIVITY_FACETS} />
    </SectionCard>
  );
}
