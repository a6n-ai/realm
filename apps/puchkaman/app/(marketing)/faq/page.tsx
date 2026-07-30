import type { Metadata } from "next";
import { Btn, PageBanner, SectionHead } from "@/components/brutal/shared";
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

// Every answer here is sourced from facts already established elsewhere in
// this codebase (hours, delivery radius/discount, forms) — nothing fabricated.
const FAQS: { q: string; a: string }[] = [
  {
    q: "What are Puchkaman's hours?",
    a: "We're open Sunday–Thursday 3:00pm–2:00am and Friday–Saturday 3:00pm–3:00am at 3315 Danforth Ave, Scarborough, ON.",
  },
  {
    q: "Do you deliver, and how far?",
    a: "Yes. Order direct and we deliver ourselves — instantly within 7km at 15% off, or on a scheduled time slot beyond 7km with a $35 order minimum. We're also on Uber Eats and DoorDash for delivery outside that.",
  },
  {
    q: "How long does pickup take?",
    a: "About 15 minutes from ordering — order ahead online, walk in, walk out.",
  },
  {
    q: "Do you do catering?",
    a: "Yes — live puchka and chaat stations for birthdays, weddings, offices, private and community events across the GTA. Submit a quote request and we reply within 24 hours.",
  },
  {
    q: "Can you accommodate food allergies?",
    a: "Let us know about any allergies or dietary restrictions in the catering request form and we'll do our best to accommodate. We prepare food in a shared kitchen, so we can't guarantee a completely allergen-free environment — if you have a serious allergy, please contact us directly before ordering.",
  },
  {
    q: "How do I pay for an online order?",
    a: "Online pickup and delivery orders are paid by card at checkout, processed through Clover.",
  },
  {
    q: "Do you host watch parties or events?",
    a: "Yes — cricket and football watch parties with live puchka stations and combo boxes. Seating is limited (30–35 people per night), so reserve your spot in advance.",
  },
];

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
          <div style={{ display: "grid", gap: 14 }}>
            {FAQS.map((f) => (
              <div key={f.q} className="card" style={{ padding: 22, background: "var(--white)" }}>
                <h3 style={{ fontSize: "1.15rem", marginBottom: 8 }}>{f.q}</h3>
                <p style={{ fontWeight: 500, opacity: 0.85 }}>{f.a}</p>
              </div>
            ))}
          </div>
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
