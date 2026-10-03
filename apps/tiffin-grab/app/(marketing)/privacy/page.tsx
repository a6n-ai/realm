import type { Metadata } from "next";
import { Callout, Clause, LegalPage, List, Mail, Sub, type KeyPoint } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Privacy policy — Tiffin Grab",
  description: "How TiffinGrab collects, uses, and protects personal information under PIPEDA and Ontario law.",
};


const SECTIONS = [
  "Information we collect",
  "How we use information",
  "We do not sell your data",
  "Limited sharing",
  "Security",
  "Retention",
  "Your rights (PIPEDA)",
  "Cookies & tracking",
  "Children’s privacy",
] as const;

const KEY_POINTS: KeyPoint[] = [
  { text: "We collect only what we need to deliver: your name, contact details, address, and order details.", section: 1 },
  { text: "Card payments go through a PCI-compliant processor. We never store your full card number or CVV.", section: 1 },
  { text: "We never sell, rent, or trade your personal information.", section: 3 },
  { text: "We send marketing only if you opt in, and you can unsubscribe at any time.", section: 2 },
  { text: "We keep records for up to 3 years after your last order (up to 5 years for complaints).", section: 6 },
  { text: "To see, correct, or delete your data, email us with the subject “Privacy Request”. We aim to reply within 30 days.", section: 7 },
];

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" intro="What personal information TiffinGrab collects, why, who sees it, how long we keep it, and how to exercise your rights under PIPEDA." updated="April 6, 2026" current="/privacy" sections={SECTIONS} keyPoints={KEY_POINTS}>
      <Callout>
        <strong>Commitment:</strong> TiffinGrab protects personal information in line with Canada’s{" "}
        <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA) and applicable Ontario law. This
        policy explains what we collect, how we use it, and your rights.
      </Callout>

      <Clause n={1} title={SECTIONS[0]}>
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

      <Clause n={2} title={SECTIONS[1]}>
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

      <Clause n={3} title={SECTIONS[2]}>
        <Callout>
          <strong>Explicit commitment:</strong> TiffinGrab does not sell, rent, trade, or transfer your personal information
          to third parties for their marketing or advertising.
        </Callout>
      </Clause>

      <Clause n={4} title={SECTIONS[3]}>
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

      <Clause n={5} title={SECTIONS[4]}>
        <p className="m-0">
          We use reasonable technical and organizational measures, including TLS in transit, access controls on a
          need-to-know basis, and PCI-compliant payment infrastructure. No online system is perfectly secure; we will
          notify you of breaches as required by law.
        </p>
      </Clause>

      <Clause n={6} title={SECTIONS[5]}>
        <p className="m-0">
          We keep data while your account is active and up to <strong>three years</strong> after your last transaction
          where needed for accounting, tax, and disputes. Communications tied to complaints may be kept up to{" "}
          <strong>five years</strong>. After that, data is deleted or anonymized where permitted.
        </p>
      </Clause>

      <Clause n={7} title={SECTIONS[6]}>
        <p className="m-0">
          You may request access, correction, deletion (subject to legal holds), and withdrawal of consent for
          non-essential uses. You may complain to the <strong>Office of the Privacy Commissioner of Canada</strong> at{" "}
          <a href="https://www.priv.gc.ca" target="_blank" rel="noreferrer" className="underline underline-offset-4">priv.gc.ca</a>.
        </p>
        <p className="m-0">
          Email <Mail /> with subject <strong>“Privacy Request”</strong>. We aim to respond within <strong>30 days</strong>.
        </p>
      </Clause>

      <Clause n={8} title={SECTIONS[7]}>
        <p className="m-0">
          We use essential cookies for site operation, and may use analytics cookies in line with our configuration. You
          can control cookies in your browser; disabling some may affect functionality.
        </p>
      </Clause>

      <Clause n={9} title={SECTIONS[8]}>
        <p className="m-0">
          Our services are not directed to children under 18. If you believe a minor submitted personal data, contact us
          and we will delete it promptly where appropriate.
        </p>
      </Clause>
    </LegalPage>
  );
}
