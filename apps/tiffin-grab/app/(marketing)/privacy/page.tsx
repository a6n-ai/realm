import type { Metadata } from "next";
import { Callout, Clause, LegalPage, List, Mail, Sub } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Privacy policy — Tiffin Grab",
  description: "How TiffinGrab collects, uses, and protects personal information under PIPEDA and Ontario law.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" meta="Effective: April 6, 2026 · Last updated: April 6, 2026 · PIPEDA aligned" current="/privacy">
      <Callout>
        <strong>Commitment:</strong> TiffinGrab protects personal information in line with Canada’s{" "}
        <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA) and applicable Ontario law. This
        policy explains what we collect, how we use it, and your rights.
      </Callout>

      <Clause n={1} title="Information we collect">
        <Sub title="1.1 You provide">
          <List
            items={[
              <><strong>Identity:</strong> name, phone, email;</>,
              <><strong>Delivery:</strong> address, unit, access notes;</>,
              <><strong>Orders:</strong> plan, preferences, order history, optional dietary notes; and</>,
              <><strong>Messages:</strong> email, WhatsApp, contact form.</>,
            ]}
          />
        </Sub>
        <Sub title="1.2 Payments">
          <p className="m-0">
            Card data is processed by our <strong>PCI-DSS compliant</strong> processor (e.g. Stripe).{" "}
            <strong>We do not store full card numbers, CVV, or banking credentials</strong> on our servers.
          </p>
        </Sub>
        <Sub title="1.3 Technical data">
          <p className="m-0">We may collect IP address, browser, device, pages viewed, and timing via cookies and server logs.</p>
        </Sub>
      </Clause>

      <Clause n={2} title="How we use information">
        <p className="m-0">We use personal data to:</p>
        <List
          items={[
            "Process, fulfil, and deliver orders;",
            "Manage subscriptions and accounts;",
            "Send operational updates (delivery, schedule changes);",
            "Respond to support requests;",
            "Meet legal obligations in Ontario and Canada;",
            "Detect fraud, chargebacks, and abuse; and",
            "Improve our service using aggregated or anonymized analytics.",
          ]}
        />
        <p className="m-0">
          <strong>Marketing:</strong> Promotional messages only if you opt in. Unsubscribe anytime (link or reply
          instructions). We do not send unsolicited marketing without consent.
        </p>
      </Clause>

      <Clause n={3} title="We do not sell your data">
        <Callout>
          <strong>Explicit commitment:</strong> TiffinGrab does not sell, rent, trade, or transfer your personal information
          to third parties for their marketing or advertising.
        </Callout>
      </Clause>

      <Clause n={4} title="Limited sharing">
        <p className="m-0">We share data only as needed:</p>
        <List
          items={[
            <><strong>Delivery:</strong> name, address, instructions to complete delivery;</>,
            <><strong>Payments:</strong> transaction data with the processor;</>,
            <><strong>Legal:</strong> when required by law or valid legal process; and</>,
            <><strong>Business transfers:</strong> a successor must honour similar protections.</>,
          ]}
        />
        <p className="m-0">Processors and partners are bound to confidentiality and purpose limitation.</p>
      </Clause>

      <Clause n={5} title="Security">
        <p className="m-0">
          We use reasonable technical and organizational measures, including TLS in transit, access controls on a
          need-to-know basis, and PCI-compliant payment infrastructure. No online system is perfectly secure; we will
          notify you of breaches as required by law.
        </p>
      </Clause>

      <Clause n={6} title="Retention">
        <p className="m-0">
          We keep data while your account is active and up to <strong>three years</strong> after your last transaction
          where needed for accounting, tax, and disputes. Communications tied to complaints may be kept up to{" "}
          <strong>five years</strong>. After that, data is deleted or anonymized where permitted.
        </p>
      </Clause>

      <Clause n={7} title="Your rights (PIPEDA)">
        <p className="m-0">
          You may request access, correction, deletion (subject to legal holds), and withdrawal of consent for
          non-essential uses. You may complain to the <strong>Office of the Privacy Commissioner of Canada</strong> at{" "}
          <a href="https://www.priv.gc.ca" target="_blank" rel="noreferrer" className="underline underline-offset-4">priv.gc.ca</a>.
        </p>
        <p className="m-0">
          Email <Mail /> with subject <strong>“Privacy Request”</strong>. We aim to respond within <strong>30 days</strong>.
        </p>
      </Clause>

      <Clause n={8} title="Cookies & tracking">
        <p className="m-0">
          We use essential cookies for site operation, and may use analytics cookies in line with our configuration. You
          can control cookies in your browser; disabling some may affect functionality.
        </p>
      </Clause>

      <Clause n={9} title="Children’s privacy">
        <p className="m-0">
          Our services are not directed to children under 18. If you believe a minor submitted personal data, contact us
          and we will delete it promptly where appropriate.
        </p>
      </Clause>
    </LegalPage>
  );
}
