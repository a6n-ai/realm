/* eslint-disable react-hooks/purity */
import Link from "next/link";
import { zonedDateIso } from "@foundry/commons";
import { SectionCard } from "@/components/ds";
import { formatDateOnly } from "@/lib/format/datetime";
import { upcomingAddressChanges } from "@/lib/services/customers.service";
import { CustomerOrdersTable } from "../customer-orders-table";
import { loadCustomer, loadViewer } from "../data";

const LIVE_PLAN = new Set(["active", "paused", "pending", "waitlisted"]);

// Imported WordPress lines already end in city + postal code; don't print them twice.
function fullAddress(line: string | null, unit: string | null, city: string | null, postalCode: string | null) {
  const base = unit ? `${unit} – ${line ?? ""}` : (line ?? "");
  const tail = [city, postalCode].filter((p): p is string => !!p && !base.toLowerCase().includes(p.toLowerCase()));
  return [base, ...tail].filter(Boolean).join(", ");
}

/** Orders tab: every subscription (each row opens the order page, which owns its calendar and log), then where live plans deliver. */
export default async function CustomerOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, { timezone }] = await Promise.all([loadCustomer(id), loadViewer()]);
  const changes = await upcomingAddressChanges(data.profile.id, zonedDateIso(Date.now(), timezone));
  const live = data.orders.filter((o) => LIVE_PLAN.has(o.status));

  return (
    <>
      <SectionCard title="Orders">
        <CustomerOrdersTable orders={data.orders} />
      </SectionCard>

      {/* Where tiffins actually go: each live plan's address (it follows the default saved
          address), then single days re-addressed on the calendar. */}
      <SectionCard title="Delivery addresses" subtitle="Plans follow the default saved address. A change applies from the next delivery whose cutoff hasn't passed.">
        <div className="flex flex-col gap-4">
          {live.length === 0 ? (
            <p className="text-muted-foreground text-sm">No live plans.</p>
          ) : (
            <ul className="divide-y text-sm">
              {live.map((o) => (
                <li key={o.publicId} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <Link href={`/dashboard/orders/${o.publicId}`} className="font-medium underline-offset-2 hover:underline">
                    {o.deploymentId}
                  </Link>
                  <div className="min-w-0 sm:text-right">
                    <p className="font-medium">{fullAddress(o.addressLine, o.addressUnit, o.city, o.postalCode)}</p>
                    {o.deliveryInstructions && <p className="text-muted-foreground text-xs">{o.deliveryInstructions}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">One-day changes</h3>
            {changes.length === 0 ? (
              <p className="text-muted-foreground text-sm">None. Every upcoming delivery goes to its plan&apos;s address.</p>
            ) : (
              <ul className="divide-y text-sm">
                {changes.map((c) => (
                  <li key={c.deliveryPublicId} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="font-medium">{formatDateOnly(c.deliveryDate, { mode: "short" })}</p>
                      <Link href={`/dashboard/orders/${c.orderPublicId}`} className="text-muted-foreground text-xs underline-offset-2 hover:underline">
                        {c.deploymentId}
                      </Link>
                    </div>
                    <div className="min-w-0 sm:text-right">
                      <p className="font-medium">{fullAddress(c.addressLine, null, c.city, c.postalCode)}</p>
                      <p className="text-muted-foreground text-xs">
                        {c.fullName ? `For ${c.fullName} · ` : ""}instead of {fullAddress(c.orderLine, c.orderUnit, c.orderCity, c.orderPostalCode)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SectionCard>
    </>
  );
}
