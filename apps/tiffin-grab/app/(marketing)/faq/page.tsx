import type { Metadata } from "next";
import { HelpCircle } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { listPublicFaqs } from "@/lib/services/faqs.service";

export const metadata: Metadata = {
  title: "FAQ — Tiffin Grab",
  description: "Answers on plans, delivery, meal sizes, pausing and billing — Tiffin Grab's most-asked questions.",
};

// Content is admin-editable (Settings > Public Website > FAQ) and org-scoped
// from the request — force-dynamic for the same reason as /contact.
export const dynamic = "force-dynamic";

// FAQPage schema for search engines.
function faqJsonLd(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export default async function FaqPage() {
  const faqs = await listPublicFaqs();

  return (
    <Section className="space-y-10">
      {faqs.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(faqs)) }} />
      )}
      <div className="flex items-center gap-3">
        <HelpCircle className="animate-float text-muted-foreground size-7" />
        <div className="max-w-2xl">
          <p className="m-0 mb-1 text-xs font-semibold tracking-[0.25em] text-primary uppercase">Got questions?</p>
          <h1 className="m-0 mb-2.5 text-[clamp(28px,5vw,52px)] font-bold tracking-[-1.5px]">Frequently asked questions.</h1>
        </div>
      </div>

      {faqs.length === 0 ? (
        <p className="text-muted-foreground">Nothing here yet — check back soon.</p>
      ) : (
        <div className="max-w-2xl divide-y divide-border">
          {faqs.map((f) => (
            <details key={f.publicId} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                <span>{f.question}</span>
                <span aria-hidden className="text-muted-foreground shrink-0 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="text-muted-foreground mt-2 whitespace-pre-line">{f.answer}</p>
            </details>
          ))}
        </div>
      )}
    </Section>
  );
}
