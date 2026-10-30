import Link from "next/link";
import { GiftIcon } from "lucide-react";
import { EmptyState, SectionCard } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
import { getReferralInfo } from "@/lib/services/referrals.service";
import { REFERRAL_STATUS } from "../../../wallet/referrals/referral-status";
import { loadCustomer, loadViewer } from "../data";

/** Referrals tab: their code, who referred them, and the friends who joined with their code. */
export default async function CustomerReferralsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, { timezone }] = await Promise.all([loadCustomer(id), loadViewer()]);
  const referral = await getReferralInfo(data.profile.id);
  const earned = referral.friends.filter((f) => f.status !== "reversed").reduce((n, f) => n + f.referrerCoins, 0);

  return (
    <>
      <SectionCard title="Referral">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Their referral code</dt>
            <dd className="font-mono font-medium">{referral.code ?? "Not made yet (made when they open Refer)"}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Referred by</dt>
            <dd className="font-medium">
              {referral.referredBy ? (
                <Link href={`/dashboard/customers/${referral.referredBy.publicId}/referrals`} className="underline-offset-2 hover:underline">
                  {referral.referredBy.name || "Customer"}
                </Link>
              ) : "No one"}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Coins earned from friends</dt>
            <dd className="tabular-nums font-medium">{earned}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Friends referred" subtitle="Each friend who joined with their code, and the coins each side got.">
        {referral.friends.length === 0 ? (
          <EmptyState
            icon={GiftIcon}
            message={referral.code ? `No friends yet. They can share code ${referral.code} from Refer in their app.` : "No friends yet. Their code appears once they open Refer in their app."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Friend</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Friend coins</TableHead>
                <TableHead className="text-right">Their coins</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referral.friends.map((f) => (
                <TableRow key={f.publicId}>
                  <TableCell>
                    <Link href={`/dashboard/customers/${f.publicId}`} className="font-medium underline-offset-2 hover:underline">{f.name || "Customer"}</Link>
                  </TableCell>
                  <TableCell><Badge variant={REFERRAL_STATUS[f.status].variant}>{REFERRAL_STATUS[f.status].label}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{f.friendCoins}</TableCell>
                  <TableCell className="text-right tabular-nums">{f.referrerCoins}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums">{formatEpoch(f.joinedAt, { mode: "date", timeZone: timezone })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </>
  );
}
