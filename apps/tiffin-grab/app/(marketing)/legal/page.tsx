import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/marketing/section";
import { LEGAL_DOCS, Mail } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Policies & disclosures — Tiffin Grab",
  description: "TiffinGrab's terms of service, privacy practices, refund rules, and delivery standards for customers in Ontario, Canada.",
};

export default function LegalHubPage() {
  return (
    <Section className="max-w-3xl">
      <header className="mb-10">
        <h1 className="m-0 mb-3 text-[clamp(28px,5vw,44px)] font-bold tracking-[-1px]">Policies &amp; disclosures</h1>
        <p className="text-muted-foreground m-0 max-w-[60ch]">
          Review our terms of service, privacy practices, refund rules, and delivery standards. Each document is
          maintained for customers in Ontario, Canada.
        </p>
      </header>
      <ul className="m-0 list-none divide-y border-y p-0">
        {LEGAL_DOCS.map((d) => (
          <li key={d.href}>
            <Link href={d.href} className="group flex items-start justify-between gap-6 py-5">
              <span>
                <span className="block font-semibold group-hover:underline group-hover:underline-offset-4">{d.title}</span>
                <span className="text-muted-foreground mt-1 block text-sm">{d.summary}</span>
              </span>
              <span aria-hidden className="text-muted-foreground mt-0.5 transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm">
        Questions? <Mail /> · <Link href="/contact" className="underline underline-offset-4">Contact us</Link>
      </p>
    </Section>
  );
}
