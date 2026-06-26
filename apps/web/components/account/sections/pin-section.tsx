import { SectionCard } from "@/components/ds";
import { PinSection as PinForm } from "@/components/account/leaves/pin-section";

export function PinSection({ hasPin, titleAs }: { hasPin: boolean; titleAs?: "h2" | "h3" }) {
  return (
    <section id="pin" className="scroll-mt-24">
      <SectionCard variant="flat" titleAs={titleAs} title="PIN">
        <PinForm hasPin={hasPin} />
      </SectionCard>
    </section>
  );
}
