"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CouponKind, DiscountPolicy } from "@/db/schema/coupons";
import { SectionCard } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ALL_KINDS, KIND_LABELS, Multiselect } from "../controls";
import { saveDiscountPolicy } from "../actions";

const CARD = {
  title: "Enabled coupon kinds",
  subtitle: "Which coupon kinds may be created and honored across the platform.",
} as const;

export function KindsForm({ policy }: { policy: DiscountPolicy }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [kinds, setKinds] = React.useState<string[]>(policy.enabledKinds);

  const dirty =
    kinds.length !== policy.enabledKinds.length ||
    kinds.some((k) => !policy.enabledKinds.includes(k as CouponKind));

  const save = () => {
    start(async () => {
      try {
        await saveDiscountPolicy({ ...policy, enabledKinds: kinds as CouponKind[] });
        toast.success("Enabled kinds saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <SectionCard title={CARD.title} subtitle={CARD.subtitle}>
      <div className="grid max-w-md gap-3">
        <Multiselect
          options={ALL_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
          value={kinds}
          onChange={setKinds}
          placeholder="Select kinds"
          searchPlaceholder="Search kinds..."
          emptyText="No kind found."
        />
        <Button onClick={save} disabled={pending || !dirty} className="w-fit">
          Save kinds
        </Button>
      </div>
    </SectionCard>
  );
}

// Exact loading twin: same SectionCard (real title/subtitle) + same grid layout,
// grey blocks where the multiselect and save button go. Rendered as the page's
// <Suspense fallback>, so it stays in sync with KindsForm by construction.
export function KindsFormSkeleton() {
  return (
    <SectionCard title={CARD.title} subtitle={CARD.subtitle}>
      <div className="grid max-w-md gap-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-24" />
      </div>
    </SectionCard>
  );
};
