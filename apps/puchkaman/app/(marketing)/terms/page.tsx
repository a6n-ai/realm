import type { Metadata } from "next";
import { PageBanner } from "@/components/brutal/shared";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";
import { PHONE_DISPLAY } from "@/lib/links";

export const metadata: Metadata = buildMetadata({
  title: "Terms of Service | Puchkaman",
  description: "Terms for using puchkaman.ca and ordering pickup, delivery or catering from Puchkaman.",
  path: "/terms",
});

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Terms of Service", path: "/terms" },
]);

const LAST_UPDATED = "July 29, 2026";

export default function TermsPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <PageBanner kicker="Legal" title="Terms of Service" bg="var(--cream)" color="var(--ink)" crumb="Terms of Service" />
      <section className="section-pad" style={{ background: "var(--page-bg)" }}>
        <div className="wrap" style={{ maxWidth: 760 }}>
          <div className="card" style={{ background: "var(--white)", padding: "clamp(24px,4vw,40px)" }}>
            <p style={{ opacity: 0.7, fontSize: "0.85rem", marginBottom: 24 }}>Last updated: {LAST_UPDATED}</p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Using this website</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              By using puchkaman.ca you agree to use it only for lawful purposes — browsing our menu, placing
              orders, requesting catering, or contacting us.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Orders &amp; pricing</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              Menu items, prices, and availability are subject to change without notice. Placing an online order
              doesn&apos;t guarantee fulfillment — orders depend on item availability and, for delivery, on
              confirming your address is within our delivery area. We&apos;ll let you know if we can&apos;t fulfill
              an order.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Delivery</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              Delivery distance, discounts, and minimums are calculated automatically at checkout based on the
              address you provide and are shown to you before you pay. Delivery times are estimates, not guarantees.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Catering &amp; event bookings</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              Submitting a catering quote request or event RSVP is a request, not a confirmed booking — our team
              will follow up directly to confirm details, availability and final pricing.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Payments</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              Online payments are processed securely through a third-party payment processor. By submitting payment, you authorize us to
              charge the amount shown at checkout.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Third-party delivery platforms</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              Orders placed through Uber Eats or DoorDash are subject to those platforms&apos; own terms — we
              fulfill the order, but the platform handles that transaction.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Changes to these terms</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              We may update these terms from time to time; the &quot;last updated&quot; date above will reflect the
              latest revision.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Contact us</h2>
            <p style={{ fontWeight: 500, opacity: 0.88 }}>
              Questions about these terms? Reach us at {PHONE_DISPLAY} or via the{" "}
              <a href="/contact" style={{ textDecoration: "underline" }}>
                contact page
              </a>
              .
            </p>
          </div>
          <p style={{ fontSize: "0.82rem", opacity: 0.6, marginTop: 16 }}>
            This page is a general terms summary and hasn&apos;t been reviewed by a lawyer. It shouldn&apos;t be
            treated as legal advice.
          </p>
        </div>
      </section>
    </div>
  );
}
