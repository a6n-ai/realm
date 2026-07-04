import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/marketing/section";
import { StepCard } from "@/components/marketing/cards";

export const metadata: Metadata = { title: "How it works — Tiffin Grab", description: "Build a plan in four steps, check out, and activate your tiffin subscription." };

const STEPS = [
  { n: 1, title: "Nutrition baseline", body: "Choose Pure Vegetarian, Halal Non-Veg, or a Veg & Non-Veg mix." },
  { n: 2, title: "Build your bundle", body: "Pick a meal size and tier; see calories, protein, carbs, and fat." },
  { n: 3, title: "Schedule & quantity", body: "Set frequency, daily quantity, weekend add-ons, and number of persons. More delivery days and weeks means more tiffins — and a lower per-tiffin rate." },
  { n: 4, title: "Duration & checkout", body: "Choose a commitment length. Longer plans mean more tiffins total, which can push you into a better volume tier." },
];

export default function HowItWorksPage() {
  return (
    <Section className="space-y-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">How it works</h1>
        <p className="text-muted-foreground mt-2">From baseline to your first delivery in a few guided steps.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => <StepCard key={s.n} {...s} />)}
      </div>
      <Button asChild size="lg" className="hover-lift group"><Link href="/subscribe">Start your plan <ArrowRight className="icon-pop size-4" /></Link></Button>
    </Section>
  );
}
