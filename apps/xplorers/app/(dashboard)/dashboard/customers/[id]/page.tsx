import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, UserIcon } from "lucide-react";
import { formatPhone } from "@foundry/commons";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { requirePermission, roleCan } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { formatAppDay, formatAppWhen } from "@/lib/app-clock";
import { getAppClock } from "@/lib/services/app-settings.service";
import { getCustomer360 } from "@/lib/services/customers.service";
import { walletService } from "@/lib/services/wallet.service";
import { AdjustCoins } from "./adjust-coins";
import { CustomerBookingsTable, CustomerLedgerTable, CustomerPaymentsTable } from "./customer-tables";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ user: ["list"] });
  const { id } = await params;
  const [customer, coins, { timezone, currency }, session] = await Promise.all([
    getCustomer360(id),
    walletService.coinsForFamily(id),
    getAppClock(),
    getSession(),
  ]);
  if (!customer) notFound();

  const role = session?.user.role ?? "";
  const canAdjust = roleCan(role, { wallet: ["update"] });
  const canReview = roleCan(role, { studioSession: ["update"] } as never);
  const { profile } = customer;
  const who = profile.name ?? profile.email ?? profile.publicId;

  return (
    <PageShell>
      <PageHeader
        icon={UserIcon}
        title={who}
        subtitle={profile.email ?? undefined}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/customers">
              <ArrowLeftIcon />
              Customers
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Profile">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Username</dt>
            <dd>{profile.username ? `@${profile.username}` : "—"}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{profile.email ?? "—"}</dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{profile.phone ? formatPhone(profile.phone) : "—"}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Badge variant={profile.status === "active" ? "default" : "outline"} className="capitalize">
                {profile.status}
              </Badge>
            </dd>
            <dt className="text-muted-foreground">Joined</dt>
            <dd className="tabular-nums">{formatAppDay(Number(profile.createdAt), timezone)}</dd>
            <dt className="text-muted-foreground">Friends</dt>
            <dd className="tabular-nums">{profile.friendCount}</dd>
          </dl>
        </SectionCard>
        <SectionCard
          title="Coins"
          action={canAdjust && coins ? <AdjustCoins publicId={profile.publicId} balance={coins.balance} who={who} /> : undefined}
        >
          {coins ? (
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Balance</dt>
              <dd className="tabular-nums">
                {coins.balance} coins · {coins.value}
              </dd>
              <dt className="text-muted-foreground">On hold</dt>
              <dd className="tabular-nums">{coins.held} coins</dd>
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">Coins are off. Set a coin rate under Wallet to turn them on.</p>
          )}
        </SectionCard>
      </div>
      <SectionCard title="Bookings">
        <CustomerBookingsTable
          currency={currency}
          rows={customer.bookings.map((b) => ({
            publicId: b.publicId,
            classTitle: b.classTitle,
            occurrencePublicId: b.occurrencePublicId,
            // occursOn is a calendar date, not an instant: format it in UTC so it never shifts a day.
            dayLabel: formatAppDay(Date.parse(b.occursOn), "UTC"),
            seats: b.seats,
            status: b.status,
            total: b.total,
          }))}
        />
      </SectionCard>
      <SectionCard title="Payments">
        <CustomerPaymentsTable
          canReview={canReview}
          rows={customer.payments.map((p) => ({ ...p, whenLabel: formatAppWhen(p.createdAt, timezone) }))}
        />
      </SectionCard>
      <SectionCard title="Ledger">
        <CustomerLedgerTable rows={customer.ledger.map((l) => ({ ...l, whenLabel: formatAppWhen(l.createdAt, timezone) }))} />
      </SectionCard>
    </PageShell>
  );
}
