import { Coins, Gift, Share2, Users, UtensilsCrossed, Wallet } from "lucide-react";
import { Card, EmptyState, IconTile, ListGroup, ListRow, Pill, StatGroup, StatTile, StepList, type Tone } from "@/components/customer/kit";
import type { ReferralSettings } from "@/lib/services/app-settings.service";
import type { ReferralFriendStatus, ReferralSummary } from "@/lib/services/referrals.service";
import { ShareCard } from "./share-card";
import { EnterCodeCard } from "./enter-code-card";

const STATUS: Record<ReferralFriendStatus, { label: string; tone: Tone }> = {
  joined: { label: "Joined", tone: "up" },
  ordered: { label: "Ordered", tone: "brand" },
  rewarded: { label: "Rewarded", tone: "ok" },
  reversed: { label: "Refunded", tone: "soft" },
};

const paused = (s: ReferralSettings) => s.referrerValue <= 0 && s.friendValue <= 0;
type Rate = { perCoin: number; currency: string } | null;

/** What coins are worth in money, so every card answers "how much is that?". Null without a rate. */
const worth = (rate: Rate, coins: number) =>
  rate ? new Intl.NumberFormat("en-CA", { style: "currency", currency: rate.currency }).format(coins * rate.perCoin) : null;

/** "20" + "coins", or "5%" + "back" for percentage rewards. */
const reward = (s: ReferralSettings, v: number) => (s.mode === "pct" ? { value: `${v}%`, unit: "back" } : { value: v, unit: v === 1 ? "coin" : "coins" });

function HowItWorks({ settings, rate }: { settings: ReferralSettings; rate: Rate }) {
  const you = reward(settings, settings.referrerValue);
  const friend = reward(settings, settings.friendValue);
  const inMoney = (v: number) => (settings.mode === "flat" && worth(rate, v) ? ` (${worth(rate, v)})` : "");
  const steps = [
    { icon: <Share2 />, tint: "blue" as const, title: "Share your code", body: "Send your link or code to a friend." },
    { icon: <UtensilsCrossed />, tint: "teal" as const, title: "They order", body: "They sign up with it and pay for their first plan." },
    { icon: <Coins />, tint: "green" as const, title: "You both get coins", body: `${you.value} ${you.unit}${inMoney(settings.referrerValue)} for you, ${friend.value} ${friend.unit}${inMoney(settings.friendValue)} for them, in both wallets.` },
  ];
  return (
    <section aria-labelledby="refer-how" className="space-y-3">
      <h2 id="refer-how" className="c-h2">How it works</h2>
      <StepList steps={steps} />
    </section>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" });

export function ReferView({ summary, wallet, rate = null }: { summary: ReferralSummary; wallet?: { coins: number; dollars: number | null }; rate?: Rate }) {
  const { code, settings, totalCoins, friends, canEnterCode } = summary;
  const flat = settings.mode === "flat";
  const offerHint = (coins: number, when: string) => (flat && worth(rate, coins) ? `Worth ${worth(rate, coins)} · ${when.toLowerCase()}` : when);
  return (
    <div className="space-y-6">
      {canEnterCode ? <EnterCodeCard /> : null}

      {/* The offer at a glance: what each side gets, before anything else. */}
      {paused(settings) ? (
        <Card className="flex items-center gap-3 p-5">
          <IconTile tint="gray" size="lg"><Gift /></IconTile>
          <p className="c-caption text-[15px] text-pretty">Referral rewards are paused right now. Your code still works for when they&apos;re back.</p>
        </Card>
      ) : (
        <StatGroup>
          <StatTile bare icon={<IconTile tint="orange"><Gift /></IconTile>} label="You get" {...reward(settings, settings.referrerValue)} hint={offerHint(settings.referrerValue, "When their first order is paid")} />
          <StatTile bare icon={<IconTile tint="pink"><Users /></IconTile>} label="Your friend gets" {...reward(settings, settings.friendValue)} hint={offerHint(settings.friendValue, "On their first order")} />
        </StatGroup>
      )}

      <ShareCard code={code} />

      <HowItWorks settings={settings} rate={rate} />

      <section aria-labelledby="refer-coins" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="refer-coins" className="c-h2">Your coins</h2>
          {rate ? <p className="c-caption tabular-nums">1 coin = {worth(rate, 1)}</p> : null}
        </div>
        <StatGroup>
          <StatTile bare icon={<IconTile tint="brown"><Coins /></IconTile>} label="From referrals" value={totalCoins} unit="coins" hint={worth(rate, totalCoins) ? `Worth ${worth(rate, totalCoins)} · earned from friends` : "Earned from friends"} />
          {wallet ? (
            <StatTile
              bare
              icon={<IconTile tint="indigo"><Wallet /></IconTile>}
              label="In your wallet"
              value={wallet.coins}
              unit="coins"
              hint={wallet.dollars == null ? "Ready to spend" : `Worth $${wallet.dollars.toFixed(2)}`}
            />
          ) : null}
        </StatGroup>
      </section>

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
