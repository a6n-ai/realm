import type { Metadata } from "next";
import { DabbaMath } from "@/components/marketing/dabba-math";
import { HowItWorksSteps } from "@/components/marketing/how-it-works-steps";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "Pricing & how it works — Tiffin Grab", description: "See the per-tiffin pricing formula, then build a plan in four guided steps." };

export default function PricingPage() {
  return (
    <Section className="space-y-10">
      <HowItWorksSteps />
      <DabbaMath eyebrow="So what does it cost?" />
    </Section>
  );
}
