import { Gift, Users } from "lucide-react";
import { Card, EmptyState, ListGroup, ListRow, Pill, StatTile, type Tone } from "@/components/customer/kit";
import type { ReferralSettings } from "@/lib/services/app-settings.service";
import type { ReferralFriendStatus, ReferralSummary } from "@/lib/services/referrals.service";
import { ShareCard } from "./share-card";

const STATUS: Record<ReferralFriendStatus, { label: string; tone: Tone }> = {
  joined: { label: "Joined", tone: "up" },
  ordered: { label: "Ordered", tone: "brand" },
  rewarded: { label: "Rewarded", tone: "ok" },
  reversed: { label: "Refunded", tone: "soft" },
};

function howItWorks(s: ReferralSettings): string {
  if (s.referrerValue <= 0 && s.friendValue <= 0) return "Referral rewards are paused right now. Your code still works for when they're back.";
  if (s.mode === "pct") {
    return `You get ${s.referrerValue}% and your friend gets ${s.friendValue}% of their first order back as coins, once it's paid.`;
  }
  return `You get ${s.referrerValue} coins and your friend gets ${s.friendValue} coins when their first order is paid.`;
}

const dateFmt = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" });

export function ReferView({ summary, wallet }: { summary: ReferralSummary; wallet?: { coins: number; dollars: number | null } }) {
  const { code, settings, totalCoins, friends } = summary;
  return (
    <div className="space-y-6">
      <ShareCard code={code} />

      <Card className="flex gap-3 p-5">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--primary-wash,#FBE3D2)] text-[var(--primary)]">
          <Gift className="size-5" />
        </span>
        <div className="space-y-1">
          <h2 className="c-h2">How it works</h2>
          <p className="c-caption text-[15px]">{howItWorks(settings)}</p>
          <p className="c-caption">Your friend signs up with your link or code. Rewards land in both wallets after their first paid order.</p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="From referrals" value={totalCoins} unit="coins" hint={`${totalCoins} coins earned`} />
        {wallet ? (
          <StatTile
            label="In your wallet"
            value={wallet.coins}
            unit="coins"
            hint={wallet.dollars == null ? undefined : `Worth $${wallet.dollars.toFixed(2)}`}
          />
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="c-h2">Your friends</h2>
        {friends.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title="No friends yet"
            body="Share your link. Friends who sign up with it show here."
          />
        ) : (
          <ListGroup>
            {friends.map((f, i) => (
              <ListRow
                key={`${f.name}-${i}`}
                label={f.name}
                sublabel={`Joined ${dateFmt.format(new Date(f.joinedAt))}`}
                value={<Pill tone={STATUS[f.status].tone} size="sm">{STATUS[f.status].label}</Pill>}
              />
            ))}
          </ListGroup>
        )}
      </section>
    </div>
  );
}
