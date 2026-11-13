import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { EmptyState } from "@/components/ds";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { getCustomerRenewal } from "@/lib/renewals/renewals.service";
import { RenewalActions, RenewalSections } from "../../../renewals/customers/[id]/renewal-body";
import { loadViewer } from "../data";
import { requestNow } from "@/lib/dates/request-now";

/** Renewals tab: the same view as Renewals → customer, inside the customer page. */
export default async function CustomerRenewalsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, isAdmin, timezone } = await loadViewer();
  const data = await getCustomerRenewal(await resolveSessionVisibleOrgIds(session), id);
  if (!data) {
    return (
      <EmptyState
        icon={RefreshCwIcon}
        message="No plans yet. Renewals show once this customer has a plan."
        action={<Link href={`/dashboard/customers/${id}/orders`} className="text-sm font-medium underline-offset-2 hover:underline">See orders</Link>}
      />
    );
  }
  const now = requestNow();
  return (
    <>
      {/* Adjust coins already sits in the page header, so no second coins button here. */}
      <RenewalActions data={data} isAdmin={isAdmin} giveCoins={false} />
      <RenewalSections data={data} today={zonedDateIso(now, timezone)} now={now} timezone={timezone} />
    </>
  );
}
