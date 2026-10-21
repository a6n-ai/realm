"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import type { ReferralSettings } from "@/lib/services/app-settings.service";
import { NumberField } from "../../discounts/controls";
import { setReferralSettingsAction } from "./actions";

const whole = (s: string) => {
  const n = Number(s.trim());
  return s.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : null;
};

export function ReferralForm({ current }: { current: ReferralSettings }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [mode, setMode] = React.useState<ReferralSettings["mode"]>(current.mode);
  const [referrer, setReferrer] = React.useState(String(current.referrerValue));
  const [friend, setFriend] = React.useState(String(current.friendValue));
  const [cap, setCap] = React.useState(current.maxPerReferrer == null ? "" : String(current.maxPerReferrer));
  const unit = mode === "pct" ? "%" : "coins";

  const save = () => {
    const referrerValue = whole(referrer);
    const friendValue = whole(friend);
    const maxPerReferrer = cap.trim() === "" ? null : whole(cap);
    if (referrerValue == null || friendValue == null) return toast.error("Enter whole numbers for both rewards");
    if (mode === "pct" && (referrerValue > 100 || friendValue > 100)) return toast.error("A percent reward must be between 0 and 100");
    if (maxPerReferrer === 0 || (cap.trim() !== "" && maxPerReferrer == null)) return toast.error("Max referrals must be 1 or more, or blank for no limit");
    start(async () => {
      try {
        await setReferralSettingsAction({ mode, referrerValue, friendValue, maxPerReferrer });
        toast.success(referrerValue === 0 && friendValue === 0 ? "Referrals are off" : "Saved referral rewards");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <SectionCard
      title="Referrals"
      subtitle="Coins for the customer who shared their code and for the friend, paid when the friend's first order is paid. A percent reward is of that order before tax. Both 0 turns referrals off."
    >
      <div className="grid max-w-sm gap-4">
        <div className="grid gap-2">
          <Label htmlFor="referral-mode">Reward</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as ReferralSettings["mode"])}>
            <SelectTrigger id="referral-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="flat">Flat coins</SelectItem>
              <SelectItem value="pct">% of first order</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <NumberField id="referral-referrer" label="Referrer gets" suffix={unit} min={0} step={1} value={referrer} onChange={setReferrer} placeholder="0" />
        <NumberField id="referral-friend" label="Friend gets" suffix={unit} min={0} step={1} value={friend} onChange={setFriend} placeholder="0" />
        <NumberField id="referral-cap" label="Max rewarded referrals per person (blank = no limit)" min={1} step={1} value={cap} onChange={setCap} placeholder="No limit" />
        <Button onClick={save} disabled={pending} className="w-fit">
          Save referral rewards
        </Button>
      </div>
    </SectionCard>
  );
}
