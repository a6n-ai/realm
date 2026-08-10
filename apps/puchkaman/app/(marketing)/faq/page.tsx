import type { Metadata } from "next";
import { Btn, PageBanner, SectionHead } from "@/components/brutal/shared";
import { FaqAccordion } from "@/components/brutal/faq-accordion";
import { FAQS } from "@/lib/faq";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "FAQ — Hours, Delivery, Catering & Ordering | Puchkaman",
  description:
    "Answers on Puchkaman's hours, delivery radius & discount, pickup time, catering, food allergies and payment — Scarborough's fusion puchka spot.",
  path: "/faq",
});

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "FAQ", path: "/faq" },
]);

// FAQPage schema lives here and only here — the homepage teases the same
// questions, and marking both up would submit duplicate FAQ entities.
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function FaqPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <PageBanner
        kicker="Got Questions?"
        title="Frequently Asked Questions"
        sub="Hours, delivery, catering & more — everything you need before you order."
        bg="var(--ink)"
        color="var(--cream)"
        crumb="FAQ"
      />
      <section className="section-pad" style={{ background: "var(--page-bg)" }}>
        <div className="wrap" style={{ maxWidth: 780 }}>
          <SectionHead title="Common Questions" />
          <FaqAccordion items={FAQS} name="faq-page" defaultOpen={0} />
          <div className="card card--cream" style={{ padding: 24, marginTop: 24, textAlign: "center" }}>
            <p style={{ fontWeight: 600, marginBottom: 14 }}>Still have a question?</p>
            <Btn page="contact" variant="green">
              Contact us →
            </Btn>
          </div>
        </div>
      </section>
    </div>
  );
}
