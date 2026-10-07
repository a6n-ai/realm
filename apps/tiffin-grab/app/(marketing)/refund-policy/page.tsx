import type { Metadata } from "next";
import { Callout, Clause, LegalPage, List, Mail, Sub, SeeSection, type KeyPoint } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Refund & return policy — Tiffin Grab",
  description: "When TiffinGrab refunds trial, weekly, and monthly plans, how to report quality issues, and processing times.",
};


const SECTIONS = [
  "General refund principles",
  "Trial & weekly plans",
  "Monthly plans",
  "Food quality & safety complaints",
  "Damaged packaging",
  "Area becomes unserviceable",
  "Statutory consumer rights",
  "Refund processing",
  "Non-refundable situations",
] as const;

const KEY_POINTS: KeyPoint[] = [
  { text: "Trial and weekly plans are not refundable, except where the law requires.", section: 2 },
  { text: "Monthly plans: cancel in writing at least 48 hours before your first delivery for a full refund.", section: 3 },
  { text: "Problem with a meal? Report it within 2 hours of delivery, with photos.", section: 4 },
  { text: "Damaged packaging gets a one-day service credit for each verified incident.", section: 5 },
  { text: "If we stop delivering to your area, you get a pro-rata refund within 14 business days.", section: 6 },
  { text: "Approved refunds are sent manually by staff, by Interac e-Transfer, after we review your written request.", section: 8 },
];

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund & return policy" intro="When you can get a refund or credit, how to report a problem with a meal, and how long refunds take. Food is perishable, so options are limited." updated="October 7, 2026" current="/refund-policy" sections={SECTIONS} keyPoints={KEY_POINTS}>
      <Callout tone="warn">
        <strong>Important:</strong> Food is perishable and time-sensitive; refund options are limited. Read this policy
        before purchasing. Submit refund requests in writing to <Mail />.
      </Callout>

      <Clause n={1} title={SECTIONS[0]}>
        <p className="m-0">We aim to be fair while recognizing that prepared food cannot be returned like non-perishable goods.</p>
        <p className="m-0">Refund requests must:</p>
        <List
          items={[
            <>Be sent in writing to <Mail />;</>,
            "Include evidence where relevant (photos, order details); and",
            "Fall within the timeframes in the sections below.",
          ]}
        />
        <p className="m-0">
          Verbal requests alone (phone or WhatsApp) are not formal claims. Approved refunds require written confirmation
          from TiffinGrab.
        </p>
      </Clause>

      <Clause n={2} title={SECTIONS[1]}>
        <p className="m-0">
          <strong>No refund.</strong> Trial and weekly plans are priced for lower commitment. <strong>No refunds</strong>{" "}
          are available except where required by law (see <SeeSection n={7} />).
        </p>
        <p className="m-0">
          Quality issues may be reviewed; we may offer a <strong>service credit or replacement</strong> as a goodwill
          gesture only. That is not a guaranteed entitlement.
        </p>
      </Clause>

      <Clause n={3} title={SECTIONS[2]}>
        <Sub title="3.1 Standard position">
          <p className="m-0">Monthly fees are generally <strong>non-refundable</strong> after the subscription has started.</p>
        </Sub>
        <Sub title="3.2 Legitimate quality complaints">
          <p className="m-0">
            Repeated, documented quality issues (minimum <strong>three</strong> separate verified incidents in one
            subscription period) may be assessed. If validated, compensation is typically{" "}
            <strong>additional service days</strong>, not cash refunds.
          </p>
        </Sub>
        <Sub title="3.3 Pre-commencement cancellation">
          <p className="m-0">
            Cancel in writing at least <strong>48 hours before</strong> your first scheduled delivery for a{" "}
            <strong>full refund</strong>. Cancellations inside that window are non-refundable.
          </p>
        </Sub>
      </Clause>

      <Clause n={4} title={SECTIONS[3]}>
        <Sub title="4.1 Reporting timeframe">
          <p className="m-0">
            Report quality issues (stale, spoiled, foreign object, major misdescription) within{" "}
            <strong>two hours of delivery</strong>. Later reports may be declined because storage conditions may have changed.
          </p>
        </Sub>
        <Sub title="4.2 Evidence">
          <p className="m-0">Include clear photos, packaging if available, order number, and approximate delivery time.</p>
        </Sub>
        <Sub title="4.3 Review">
          <p className="m-0">
            We aim to respond within <strong>three business days</strong>. Remedies may include replacement meal, credit for
            one service day, or—where safety is implicated—written follow-up plus credit.
          </p>
        </Sub>
        <Sub title="4.4 Storage">
          <p className="m-0">Refrigerate within two hours of delivery. Claims from improper storage after delivery are not eligible.</p>
        </Sub>
      </Clause>

      <Clause n={5} title={SECTIONS[4]}>
        <p className="m-0">
          Visible damage or leaking: report within two hours with photos. Verified incidents receive a{" "}
          <strong>one-day service credit</strong> per incident. Same-day re-delivery is not guaranteed.
        </p>
      </Clause>

      <Clause n={6} title={SECTIONS[5]}>
        <p className="m-0">
          If your address was serviceable at purchase but we later remove the area for operational reasons, you receive a{" "}
          <strong>full pro-rata refund</strong> for undelivered days, sent manually by Interac e-Transfer after staff
          approval, within <strong>14 business days</strong> of written confirmation. This does not apply if the address became
          unserviceable due to inaccurate information from you.
        </p>
      </Clause>

      <Clause n={7} title={SECTIONS[6]}>
        <p className="m-0">
          Nothing here limits rights you may have under the <em>Consumer Protection Act, 2002</em> (Ontario) or other
          applicable Canadian consumer law. Where the law gives you more, the law prevails.
        </p>
      </Clause>

      <Clause n={8} title={SECTIONS[7]}>
        <p className="m-0">
          An approved refund is sent <strong>manually by our staff</strong>. Nothing is refunded until a staff member
          approves the request and we email you that confirmation.
        </p>
        <p className="m-0">
          Today that refund is an <strong>Interac e-Transfer</strong>. When card payments through Stripe are available, an
          approved card refund will go back to that card, and your bank sets how long it takes to appear.
        </p>
        <p className="m-0">
          Review may take up to <strong>3–4 weeks</strong> from your written request. No refund is started without email
          confirmation from us.
        </p>
      </Clause>

      <Clause n={9} title={SECTIONS[8]}>
        <p className="m-0">Examples where we do not issue refunds include:</p>
        <List
          items={[
            "Missed delivery due to your unavailability without alternate instructions;",
            "Incorrect or incomplete address you provided;",
            "Quality concerns reported after the two-hour window;",
            "Spice, portion, or taste preferences not raised during trial;",
            "Improper storage after delivery;",
            "Change of mind, travel, or lifestyle (except where pausing applies per Terms);",
            "Trial or weekly purchases; or",
            "A payment dispute or reversal for legitimately delivered service (see Terms).",
          ]}
        />
      </Clause>
    </LegalPage>
  );
}
