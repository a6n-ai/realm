import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, RotateCcw, ShieldCheck, Truck, type LucideIcon } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { LEGAL_DOCS, Mail } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Policies — Tiffin Grab",
  description: "TiffinGrab's terms of service, privacy practices, refund rules, and delivery standards for customers in Ontario, Canada.",
};

const ICONS: Record<(typeof LEGAL_DOCS)[number]["href"], LucideIcon> = {
  "/terms": FileText,
  "/privacy": ShieldCheck,
  "/refund-policy": RotateCcw,
  "/delivery-policy": Truck,
};

// The questions customers actually arrive with, each answered in one line and
// linked to the section that governs it.
const QUICK_ANSWERS = [
  { q: "Can I get a refund?", a: "Trial and weekly plans, no. Monthly plans, yes, if you cancel in writing at least 48 hours before your first delivery.", href: "/refund-policy#s2" },
  { q: "How do I pause my plan?", a: "Tell us at least 24 hours before your next delivery. Unused days may be credited to the end of your plan.", href: "/terms#s5" },
  { q: "Something was wrong with my meal.", a: "Report it within 2 hours of delivery, with photos, to info@tiffingrab.ca.", href: "/refund-policy#s4" },
  { q: "What if I miss a delivery?", a: "We make one attempt. If it fails because of our error, the day is credited.", href: "/delivery-policy#s5" },
  { q: "Is the food safe for allergies?", a: "Meals are made in a shared kitchen with common allergens. Not suitable for severe allergies.", href: "/terms#s6" },
  { q: "Do you sell my data?", a: "Never. We share only what's needed, such as your address with delivery and payment details with our processor.", href: "/privacy#s3" },
] as const;

export default function LegalHubPage() {
  return (
    <Section className="max-w-5xl">
      <header className="mb-12 max-w-[60ch]">
        <h1 className="m-0 mb-3 text-[clamp(32px,5vw,48px)] font-bold leading-[1.05] tracking-[-0.03em]">Policies</h1>
        <p className="text-muted-foreground m-0 text-[17px] leading-relaxed">
          Our terms of service, privacy practices, refund rules, and delivery standards, written for customers in Ontario,
          Canada. Each one starts with a short version in plain words.
        </p>
      </header>

      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {LEGAL_DOCS.map((d) => {
          const Icon = ICONS[d.href];
          return (
            <li key={d.href}>
              <Link href={d.href} className="group hover:bg-muted flex h-full gap-4 rounded-2xl border p-5 transition-colors">
                <span className="bg-muted text-foreground grid size-11 shrink-0 place-items-center rounded-xl group-hover:bg-background">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 font-semibold">
                    {d.title}
                    <ArrowRight aria-hidden className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="text-muted-foreground mt-1 block text-sm leading-relaxed">{d.summary}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="quick-answers" className="mt-16">
        <h2 id="quick-answers" className="m-0 mb-6 text-[22px] font-semibold tracking-[-0.015em]">Quick answers</h2>
        <ul className="m-0 list-none divide-y border-y p-0">
          {QUICK_ANSWERS.map((x) => (
            <li key={x.q}>
              <Link href={x.href} className="group flex items-start justify-between gap-6 py-4">
                <span>
                  <span className="block font-medium">{x.q}</span>
                  <span className="text-muted-foreground mt-1 block text-[15px] leading-relaxed">{x.a}</span>
                </span>
                <span className="text-muted-foreground mt-0.5 shrink-0 whitespace-nowrap text-sm group-hover:text-foreground">
                  Read <ArrowRight aria-hidden className="inline size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 text-[15px]">
        Still have a question? Email <Mail /> or <Link href="/contact" className="font-medium underline underline-offset-4">contact us</Link>.
      </p>
    </Section>
  );
}
