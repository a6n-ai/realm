import { asc, desc, eq, sql } from "drizzle-orm";
import { parseFilterState, SectionCard } from "@foundry/design-system";
import { WalletLedgerTable } from "@foundry/crm";
import { db } from "@/db/client";
import { bookings, users, walletLedger } from "@/db/schema";
import { requirePermission, roleCan } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { formatAppWhen } from "@/lib/app-clock";
import { getAppClock } from "@/lib/services/app-settings.service";
import { EVENT_LABELS } from "@/lib/services/wallet.service";
import { AdjustFamily } from "./adjust-family";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function WalletLedgerPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ wallet: ["read"] });
  const sp = await searchParams;
  const { page } = parseFilterState([], sp);
  const session = await getSession();
  const canEdit = session?.user ? roleCan(session.user.role, { wallet: ["update"] }) : false;

  const [rows, [{ total }], { timezone }, families] = await Promise.all([
    db
      .select({
        publicId: walletLedger.publicId,
        createdAt: walletLedger.createdAt,
        direction: walletLedger.direction,
        eventType: walletLedger.eventType,
        sourceType: walletLedger.sourceType,
        coins: walletLedger.coins,
        memo: walletLedger.memo,
        name: users.name,
        email: users.email,
        bookingPublicId: bookings.publicId,
      })
      .from(walletLedger)
      .leftJoin(users, eq(users.id, walletLedger.userId))
      .leftJoin(bookings, eq(bookings.id, walletLedger.orderId))
      .orderBy(desc(walletLedger.createdAt), desc(walletLedger.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ total: sql<number>`cast(count(*) as int)` }).from(walletLedger),
    getAppClock(),
    canEdit
      ? db
          .select({ publicId: users.publicId, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.role, "user"))
          .orderBy(asc(users.name), asc(users.email))
      : Promise.resolve([]),
  ]);

  return (
    <div className="grid gap-6">
      {canEdit ? (
        <SectionCard title="Give or take coins" subtitle="Every change needs a reason and shows in the ledger below.">
          <AdjustFamily
            families={families.map((f) => ({ publicId: f.publicId, label: f.name ? `${f.name} · ${f.email ?? ""}` : (f.email ?? f.publicId) }))}
          />
        </SectionCard>
      ) : null}
      <WalletLedgerTable
        rows={rows.map((r) => ({
          publicId: r.publicId,
          when: formatAppWhen(r.createdAt, timezone),
          direction: r.direction,
          eventLabel: r.eventType ? EVENT_LABELS[r.eventType] : null,
          sourceType: r.sourceType,
          coins: r.coins,
          memo: r.memo,
          who: r.name ?? r.email,
          orderLabel: r.bookingPublicId,
          orderHref: null,
        }))}
        page={page.page}
        size={page.size}
        total={total}
        orderColumnLabel="Booking"
      />
    </div>
  );
}
