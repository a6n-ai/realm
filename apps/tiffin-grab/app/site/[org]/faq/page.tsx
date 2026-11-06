import { siteOrgId } from "@/lib/tenant/site-org";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { FAQS } from "@/components/landing/faqs";
import { PageIntro } from "@/components/landing/public-shell";
import { listPublicFaqs } from "@/lib/services/faqs.service";
import { pageMeta } from "@/lib/landing/meta";
import { jsonLdScript } from "@/lib/landing/business-jsonld";

export const metadata: Metadata = pageMeta("Tiffin Service FAQ: Delivery, Changes, Pricing | Tiffin Grab", "How Tiffin Grab works: where we deliver in the GTA, changing what comes on a given day, how pricing works, and how to pay for your plan.", "/faq");
export const revalidate = 3600;
export const dynamic = "error";

// Content is admin-editable (Settings > Public Website > FAQ) and org-scoped.

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

export default async function FaqPage({ params }: { params: Promise<{ org: string }> }) {
  const saved = await listPublicFaqs(await siteOrgId((await params).org));
  const faqs = saved.length > 0 ? saved.map((f) => ({ question: f.question, answer: f.answer })) : FAQS.map((f) => ({ question: f.q, answer: f.a }));

  return (
    <div className="lp-wrap lp-section">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(faqs)) }} />
      <PageIntro eyebrow="FAQ" title={<>Before you <span className="c-accent">order.</span></>} />
      <div className="max-w-[820px]">
        <FaqAccordion items={faqs.map((f) => ({ q: f.question, a: f.answer }))} name="faq" />
      </div>
      <div className="lp-actions lp-actions--start mt-6"><Link href="/contact" className="lp-textlink">Something else? Ask us<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link></div>
    </div>
  );
}
