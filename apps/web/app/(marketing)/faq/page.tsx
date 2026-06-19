import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "FAQ — Tiffin Grab", description: "Answers to common questions about plans, delivery, and customization." };

const FAQS = [
  { q: "Where do you deliver?", a: "Across eleven GTA regions. Enter your postal code at checkout to see your slot window — if we don't serve your area yet, you can join the waitlist." },
  { q: "Can I customize my meals?", a: "Yes. You choose a nutrition baseline, meal size, schedule, daily quantity, weekend add-ons, and commitment length." },
  { q: "How does pricing work?", a: "Pricing is built from your selections: meal base price × quantity × billable days, plus add-ons, minus courier, student, and loyalty discounts. See the Pricing page." },
  { q: "Is there a student discount?", a: "Yes — a 10% student discount can be applied during plan building." },
  { q: "How do I pay?", a: "Checkout currently uses a simulated payment while we finish onboarding our payment provider." },
];

export default function FaqPage() {
  return (
    <Section className="max-w-2xl space-y-6">
      <h1 className="gradient-text text-3xl font-semibold tracking-tight">Frequently asked questions</h1>
      <dl className="space-y-5">
        {FAQS.map((f) => (
          <div key={f.q} className="hover-lift card-glow rounded-lg border p-5">
            <dt className="font-medium">{f.q}</dt>
            <dd className="text-muted-foreground mt-1 text-sm">{f.a}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
