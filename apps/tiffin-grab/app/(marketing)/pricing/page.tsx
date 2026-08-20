import type { Metadata } from "next";
import { DabbaMath } from "@/components/marketing/dabba-math";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "Pricing & how it works — Tiffin Grab", description: "See the per-tiffin pricing formula, then build a plan in four guided steps." };

const STEPS = [
  { n: 1, title: "Nutrition baseline", body: "Choose Pure Vegetarian, Halal Non-Veg, or a Veg & Non-Veg mix." },
  { n: 2, title: "Build your bundle", body: "Pick a meal size and tier; see calories, protein, carbs, and fat." },
  { n: 3, title: "Schedule & quantity", body: "Set frequency, daily quantity, weekend add-ons, and number of persons. More delivery days and weeks means more tiffins — and a lower per-tiffin rate." },
  { n: 4, title: "Duration & checkout", body: "Choose a commitment length. Longer plans mean more tiffins total, which can push you into a better volume tier." },
];

export default function PricingPage() {
  return (
    <Section className="space-y-10">
      <div className="space-y-8">
        <div className="max-w-2xl">
          <p className="m-0 mb-1 text-xs font-semibold tracking-[0.25em] text-primary uppercase">01 — How it works</p>
          <h2 className="m-0 text-[clamp(28px,5vw,50px)] leading-[1.05] font-bold tracking-[-1.5px]">From baseline to your first delivery.</h2>
        </div>
        <div className="grid gap-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border-[1.5px] border-foreground p-6">
              <span className="text-sm font-semibold text-muted-foreground tabular-nums">{String(s.n).padStart(2, "0")}</span>
              <h3 className="mt-1 text-[clamp(20px,3vw,28px)] font-bold tracking-[-1px]">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <DabbaMath eyebrow="02 — The dabba math" />
    </Section>
  );
}
