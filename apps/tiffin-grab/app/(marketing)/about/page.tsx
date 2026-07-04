import type { Metadata } from "next";
import { UtensilsCrossed } from "lucide-react";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "About — Tiffin Grab", description: "Why Tiffin Grab exists: customizable, home-style meals for the GTA." };

export default function AboutPage() {
  return (
    <Section className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <UtensilsCrossed className="animate-float text-muted-foreground size-7" />
        <h1 className="text-3xl font-semibold tracking-tight">About Tiffin Grab</h1>
      </div>
      <p className="text-muted-foreground">
        Tiffin Grab brings home-style, customizable meals to the Greater Toronto Area. We believe
        a good tiffin should fit your diet, your schedule, and your budget — not the other way
        around. Every plan is built by you: nutrition baseline, meal size, delivery rhythm, and
        commitment length.
      </p>
      <p className="text-muted-foreground">
        We cook balanced thalis and bowls in small batches and deliver them on slot windows matched
        to your neighbourhood across eleven GTA regions.
      </p>
    </Section>
  );
}
