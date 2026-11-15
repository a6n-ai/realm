import { SectionCard } from "@/components/ds";
import { can, requirePagePermission } from "@/lib/auth/guards";
import { inquiryTimeline } from "@/lib/services/customers.service";
import { OrderActivityLog, type OrderActivityLogRow } from "../../../orders/[id]/order-activity-log";
import { CUSTOMER_ACTIVITY_FACETS } from "../../../orders/[id]/activity-facets";
import {
  loadCustomerAddressEvents,
  loadCustomerInquiries,
  loadCustomerOrderActivity,
  loadCustomerPlanAddressEvents,
  loadCustomerWalletEvents,
} from "../data";

const ACCOUNT_TYPE = { address: "account_address", wallet: "account_wallet", inquiry: "account_inquiry" } as const;

/** Activity tab: the order page's log across every order of this customer, plus account events (addresses, coins, inquiries). Each part needs its own permission. */
export default async function CustomerActivityPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission({ customer: ["read"] });
  const { id } = await params;
  const [canOrder, canInquiry, canWallet] = await Promise.all([can({ order: ["read"] }), can({ inquiry: ["read"] }), can({ wallet: ["read"] })]);
  const [orderRows, planAddress, inquiryEvents, walletEvents, addressEvents] = await Promise.all([
    canOrder ? loadCustomerOrderActivity(id) : [],
    canOrder ? loadCustomerPlanAddressEvents(id) : [],
    canInquiry ? loadCustomerInquiries(id).then(inquiryTimeline) : [],
    canWallet ? loadCustomerWalletEvents(id) : [],
    loadCustomerAddressEvents(id),
  ]);
  const account = [...inquiryEvents, ...walletEvents, ...addressEvents, ...planAddress].sort((a, b) => b.at - a.at);

  const rows: OrderActivityLogRow[] = [
    ...orderRows.map(({ orderPublicId, deploymentId, ...r }) => ({ ...r, order: { publicId: orderPublicId, label: deploymentId } })),
    ...account.map((e) => ({
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
    })),
  ];

  return (
    <SectionCard title="Activity" subtitle="Every change on this customer's orders and account, by staff, the customer or the system.">
      <OrderActivityLog activities={rows} facets={CUSTOMER_ACTIVITY_FACETS} />
    </SectionCard>
  );
}
