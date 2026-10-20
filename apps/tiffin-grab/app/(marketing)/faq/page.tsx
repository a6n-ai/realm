import type { Metadata } from "next";
import Link from "next/link";
import { FAQS } from "@/components/landing/faqs";
import { PageIntro } from "@/components/landing/public-shell";
import { listPublicFaqs } from "@/lib/services/faqs.service";
import { pageMeta } from "@/lib/landing/meta";

export const metadata: Metadata = pageMeta("FAQ | Tiffin Grab", "Answers on plans, delivery, meal sizes, pausing and billing: Tiffin Grab's most-asked questions.", "/faq");

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
  const saved = await listPublicFaqs();
  const faqs = saved.length > 0 ? saved.map((f) => ({ question: f.question, answer: f.answer })) : FAQS.map((f) => ({ question: f.q, answer: f.a }));

  return (
    <div className="tg-wrap tg-section">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(faqs)) }} />
      <PageIntro eyebrow="FAQ" title={<>Before you <span className="c-accent">order.</span></>} />
      <div className="tg-card tg-faq max-w-[820px]">
        {faqs.map((f) => (
          <details key={f.question}>
            <summary>{f.question}</summary>
            <p className="whitespace-pre-line">{f.answer}</p>
          </details>
        ))}
      </div>
      <p className="mt-6">Something else? <Link href="/contact" className="tg-link tg-link--tap">Ask us</Link></p>
    </div>
  );
}
