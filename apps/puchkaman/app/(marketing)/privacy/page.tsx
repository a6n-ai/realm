import type { Metadata } from "next";
import { PageBanner } from "@/components/brutal/shared";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";
import { PHONE_DISPLAY } from "@/lib/links";

export const metadata: Metadata = buildMetadata({
  title: "Privacy Policy | Puchkaman",
  description: "How Puchkaman collects, uses and protects information from orders, catering requests and site visits.",
  path: "/privacy",
});

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Privacy Policy", path: "/privacy" },
]);

const LAST_UPDATED = "July 29, 2026";

export default function PrivacyPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <PageBanner kicker="Legal" title="Privacy Policy" bg="var(--cream)" color="var(--ink)" crumb="Privacy Policy" />
      <section className="section-pad" style={{ background: "var(--page-bg)" }}>
        <div className="wrap" style={{ maxWidth: 760 }}>
          <div className="card" style={{ background: "var(--white)", padding: "clamp(24px,4vw,40px)" }}>
            <p style={{ opacity: 0.7, fontSize: "0.85rem", marginBottom: 24 }}>Last updated: {LAST_UPDATED}</p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Information we collect</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              When you place an order, request a catering quote, or contact us, we collect the information you
              provide directly — such as your name, phone number, email address, delivery or event address, and
              order details. We don&apos;t collect information beyond what&apos;s needed to fulfill your request.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>How we use it</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              We use this information to process and deliver your order, respond to catering and contact requests,
              and — for delivery orders — to calculate distance from our store. Catering inquiries submitted through
              our form are sent to us via WhatsApp and email so our team can follow up.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Payment processing</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              Online payments are processed by Clover, a third-party payment processor. We do not store your full
              card details on our servers.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Delivery address lookup</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              When you enter a delivery address, we look up its approximate location via OpenStreetMap to determine
              delivery eligibility and distance. This lookup uses only the address you provide.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Cookies</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              We use essential cookies/local storage to keep your cart and theme preference (light/dark) working
              across visits. We don&apos;t use these for advertising or cross-site tracking.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Sharing your information</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              We don&apos;t sell your personal information. We share it only with the service providers needed to
              fulfill your request (payment processing, address lookup) and never for their own marketing purposes.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Your choices</h2>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              You can ask us what information we hold about you, or ask us to delete it, by contacting us using the
              details below.
            </p>

            <h2 style={{ fontSize: "1.3rem", marginBottom: 10 }}>Contact us</h2>
            <p style={{ fontWeight: 500, opacity: 0.88 }}>
              Questions about this policy? Reach us at {PHONE_DISPLAY} or via the{" "}
              <a href="/contact" style={{ textDecoration: "underline" }}>
                contact page
              </a>
              .
            </p>
          </div>
          <p style={{ fontSize: "0.82rem", opacity: 0.6, marginTop: 16 }}>
            This page is a general policy summary and hasn&apos;t been reviewed by a lawyer. It shouldn&apos;t be
            treated as legal advice.
          </p>
        </div>
      </section>
    </div>
  );
}
