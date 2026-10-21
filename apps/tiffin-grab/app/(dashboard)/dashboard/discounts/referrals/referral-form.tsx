"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Skeleton } from "@foundry/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import type { ReferralSettings } from "@/lib/services/app-settings.service";
import { NumberField } from "../controls";
import { setReferralSettingsAction } from "./actions";

const TITLE = "Referral rewards";
const SUBTITLE = "Paid to both people when the friend's first order is paid. Both rewards 0 turns referrals off.";

const whole = (s: string) => {
  const n = Number(s.trim());
  return s.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : null;
};

function Hinted({ hint, children }: { hint: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      {children}
      <p className="text-muted-foreground text-xs text-pretty">{hint}</p>
    </div>
  );
}

export function ReferralForm({ current }: { current: ReferralSettings }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [mode, setMode] = React.useState<ReferralSettings["mode"]>(current.mode);
  const [referrer, setReferrer] = React.useState(String(current.referrerValue));
  const [friend, setFriend] = React.useState(String(current.friendValue));
  const [cap, setCap] = React.useState(current.maxPerReferrer == null ? "" : String(current.maxPerReferrer));
  const unit = mode === "pct" ? "%" : "coins";
  const dirty =
    mode !== current.mode ||
    referrer !== String(current.referrerValue) ||
    friend !== String(current.friendValue) ||
    cap !== (current.maxPerReferrer == null ? "" : String(current.maxPerReferrer));

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
      title={TITLE}
      subtitle={SUBTITLE}
      action={
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          Save rewards
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Hinted hint={mode === "pct" ? "Share of the first order before tax, as coins." : "Fixed coins, whatever the order."}>
          <div className="grid gap-2">
            <Label htmlFor="referral-mode">Reward type</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as ReferralSettings["mode"])}>
              <SelectTrigger id="referral-mode" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flat">Flat coins</SelectItem>
                <SelectItem value="pct">% of first order</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Hinted>
        <Hinted hint="The customer who shared their code.">
          <NumberField id="referral-referrer" label="Referrer gets" suffix={unit} min={0} step={1} value={referrer} onChange={setReferrer} placeholder="0" />
        </Hinted>
        <Hinted hint="The new customer who used the code.">
          <NumberField id="referral-friend" label="Friend gets" suffix={unit} min={0} step={1} value={friend} onChange={setFriend} placeholder="0" />
        </Hinted>
        <Hinted hint="Rewarded referrals per person. Blank = no limit.">
          <NumberField id="referral-cap" label="Max per referrer" min={1} step={1} value={cap} onChange={setCap} placeholder="No limit" />
        </Hinted>
      </div>
    </SectionCard>
  );
}

export function ReferralFormSkeleton() {
  return (
    <SectionCard title={TITLE} subtitle={SUBTITLE} action={<Skeleton className="h-8 w-28" />}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="grid gap-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
