import Link from "next/link";
import { Skeleton } from "@foundry/ui/skeleton";
import { Badge } from "@/components/reui/badge";
import { SectionCard, StageBadge } from "@/components/ds";
import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { formatEpoch } from "@/lib/format/datetime";
import { trackLabel } from "@/lib/renewals/status";
import { inquiryOrderCard, type InquiryOrderCard as Card } from "@/lib/inquiries/inquiry-links.service";

const link = "text-primary text-sm underline-offset-2 hover:underline";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** The order's inquiry: who owns the person, which round this order is, and what is due next. */
export async function OrderInquiryCard({ orderId, orderPublicId, timezone }: { orderId: bigint; orderPublicId: string; timezone: string }) {
  let card: Card | null;
  try {
    card = await inquiryOrderCard(orderId, await resolveSessionVisibleOrgIds(await getSession()));
  } catch {
    return (
      <SectionCard title="Inquiry">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-destructive">Couldn&apos;t load the inquiry.</span>
          <Link href={`/dashboard/orders/${orderPublicId}`} className={link}>Retry</Link>
        </div>
      </SectionCard>
    );
  }
  if (!card) {
    return (
      <SectionCard title="Inquiry">
        <div className="flex flex-col gap-1">
          <p className="text-sm">No inquiry linked</p>
          <Link href="/dashboard/inquiries" className={link}>Open inquiries</Link>
        </div>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Inquiry" action={<Link href={`/dashboard/inquiries/${card.publicId}`} className={link}>Open inquiry</Link>}>
      <dl className="flex flex-col gap-2">
        <Row label="Person">{card.fullName ?? "—"}</Row>
        <Row label="Round"><Badge variant="secondary">{card.roundLabel}</Badge></Row>
        <Row label="Owner">{card.ownerName ?? "Unassigned"}</Row>
        <Row label="Lead status"><StageBadge stage={card.stage} /></Row>
        {card.renewalStatus ? <Row label="Renewal">{trackLabel(card.renewalStatus)}</Row> : null}
        {card.nextFollowUpAt != null ? <Row label="Next follow-up">{formatEpoch(card.nextFollowUpAt, { mode: "datetime", timeZone: timezone })}</Row> : null}
      </dl>
    </SectionCard>
  );
}

export function OrderInquiryCardSkeleton() {
  return (
    <SectionCard title="Inquiry">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </SectionCard>
  );
}
