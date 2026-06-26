"use client";

import { SectionCard } from "@/components/ds";
import { PinSection as PinForm } from "@/components/account/leaves/pin-section";

export function PinSection({ hasPin }: { hasPin: boolean }) {
  return (
    <section id="pin" className="scroll-mt-24">
      <SectionCard title="PIN">
        <PinForm hasPin={hasPin} />
      </SectionCard>
    </section>
  );
}
