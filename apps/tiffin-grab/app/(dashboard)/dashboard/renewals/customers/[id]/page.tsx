import { isAdmin } from "@/lib/auth/roles";
import { notFound } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { PageShell, PageHeader } from "@/components/ds";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { getCustomerRenewal } from "@/lib/services/renewals.service";
import { RenewalActions, RenewalSections } from "./renewal-body";
import { requestNow } from "@/lib/dates/request-now";

/** One customer's renewals only: how often and how fast they renew, each plan and what followed it, and the reminders sent. */
export default async function CustomerRenewalPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ order: ["read"] });
  const { id } = await params;
  const session = await getSession();
  const [visible, { timezone }] = await Promise.all([resolveSessionVisibleOrgIds(session), getAppSettings()]);
  const data = await getCustomerRenewal(visible, id);
  if (!data) notFound();
  const now = requestNow();
  const today = zonedDateIso(now, timezone);
  const { customer } = data;

  return (
    <PageShell>
      <PageHeader
        icon={RefreshCwIcon}
        title={customer.name || "Unnamed customer"}
        subtitle={[customer.phone, customer.email].filter(Boolean).join(" · ") || undefined}
        actions={<RenewalActions data={data} isAdmin={isAdmin(session)} />}
      />
      <RenewalSections data={data} today={today} now={now} timezone={timezone} />
    </PageShell>
  );
}
