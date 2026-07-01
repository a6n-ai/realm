"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CouponKind, DiscountPolicy } from "@/db/schema/coupons";
import { SectionCard } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { ALL_KINDS, KIND_LABELS, Multiselect } from "../controls";
import { saveDiscountPolicy } from "../actions";

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
    <SectionCard
      title="Enabled coupon kinds"
      subtitle="Which coupon kinds may be created and honored across the platform."
    >
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
