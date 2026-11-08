import { BreadcrumbSchema } from "@/components/landing/breadcrumb-schema";
import { siteOrgId } from "@/lib/tenant/site-org";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { PageIntro } from "@/components/landing/public-shell";
import { listPublicFaqs } from "@/lib/services/faqs.service";
import { pageMeta } from "@/lib/landing/meta";
import { jsonLdScript } from "@/lib/landing/business-jsonld";
import { buildFaq, type FaqGroup } from "@/lib/landing/faq-list";
import { loadSiteFacts } from "@/lib/landing/site-facts";
import { loadReferralOffer } from "@/lib/referrals/offer";
import { referHeadline } from "@/components/landing/refer/refer-content";

export const metadata: Metadata = pageMeta("Tiffin Service FAQ: Delivery, Changes, Pricing | Tiffin Grab", "How Tiffin Grab works: where we deliver in the GTA, changing what comes on a given day, how pricing works, and how to pay for your plan.", "/faq");
export const revalidate = 3600;
export const dynamic = "error";

// An admin-edited list (Settings > Public Website > FAQ, org-scoped) wins; otherwise the default list is built from live data.

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
  let groups: FaqGroup[];
  if (saved.length > 0) groups = [{ heading: "", items: saved.map((f) => ({ q: f.question, a: f.answer })) }];
  else {
    const [facts, offer] = await Promise.all([loadSiteFacts(), loadReferralOffer()]);
    groups = buildFaq(facts, offer.on ? referHeadline(offer) : null);
  }
  const faqs = groups.flatMap((g) => g.items.map((i) => ({ question: i.q, answer: i.a })));

  return (
    <div className="lp-wrap lp-section">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(faqs)) }} />
      <BreadcrumbSchema name="FAQ" path="/faq" />
      <PageIntro eyebrow="FAQ" title={<>Before you <span className="c-accent">order.</span></>} />
      <div className="flex max-w-[820px] flex-col gap-10">
        {groups.map((g, i) => (
          <section key={g.heading} aria-labelledby={g.heading ? `faq-${i}` : undefined} className="flex flex-col gap-4">
            {g.heading ? <h2 id={`faq-${i}`} className="lp-h2 !text-[clamp(26px,3vw,34px)]">{g.heading}</h2> : null}
            <FaqAccordion items={g.items} name={`faq-${i}`} openFirst={i === 0} />
          </section>
        ))}
      </div>
      <div className="lp-actions lp-actions--start mt-6"><Link href="/contact" className="lp-textlink">Something else? Ask us<ArrowRight aria-hidden className="size-4" strokeWidth={2} /></Link></div>
    </div>
  );
}
