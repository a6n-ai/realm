import type { Metadata } from "next";
import { Callout, Clause, LegalPage, List, Mail, Sub } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Refund & return policy — Tiffin Grab",
  description: "When TiffinGrab refunds trial, weekly, and monthly plans, how to report quality issues, and processing times.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund & return policy" meta="Effective: April 6, 2026 · Last updated: April 6, 2026" current="/refund-policy">
      <Callout tone="warn">
        <strong>Important:</strong> Food is perishable and time-sensitive; refund options are limited. Read this policy
        before purchasing. Submit refund requests in writing to <Mail />.
      </Callout>

      <Clause n={1} title="General refund principles">
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

      <Clause n={2} title="Trial & weekly plans">
        <p className="m-0">
          <strong>No refund.</strong> Trial and weekly plans are priced for lower commitment. <strong>No refunds</strong>{" "}
          are available except where required by law (see §7).
        </p>
        <p className="m-0">
          Quality issues may be reviewed; we may offer a <strong>service credit or replacement</strong> as a goodwill
          gesture only. That is not a guaranteed entitlement.
        </p>
      </Clause>

      <Clause n={3} title="Monthly plans">
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

      <Clause n={4} title="Food quality & safety complaints">
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

      <Clause n={5} title="Damaged packaging">
        <p className="m-0">
          Visible damage or leaking: report within two hours with photos. Verified incidents receive a{" "}
          <strong>one-day service credit</strong> per incident. Same-day re-delivery is not guaranteed.
        </p>
      </Clause>

      <Clause n={6} title="Area becomes unserviceable">
        <p className="m-0">
          If your address was serviceable at purchase but we later remove the area for operational reasons, you receive a{" "}
          <strong>full pro-rata refund</strong> for undelivered days to your original payment method within{" "}
          <strong>14 business days</strong> of written confirmation. This does not apply if the address became
          unserviceable due to inaccurate information from you.
        </p>
      </Clause>

      <Clause n={7} title="Statutory consumer rights">
        <p className="m-0">
          Nothing here limits rights you may have under the <em>Consumer Protection Act, 2002</em> (Ontario) or other
          applicable Canadian consumer law. Where the law gives you more, the law prevails.
        </p>
      </Clause>

      <Clause n={8} title="Refund processing">
        <p className="m-0">Approved refunds go to the <strong>original payment method</strong>.</p>
        <List
          items={[
            <><strong>Card:</strong> typically 5–10 business days after approval (bank dependent);</>,
            <><strong>Other methods:</strong> often 10–15 business days after approval.</>,
          ]}
        />
        <p className="m-0">
          Internal processing may take up to <strong>3–4 weeks</strong> from written approval. No refund is started without
          email confirmation from us.
        </p>
      </Clause>

      <Clause n={9} title="Non-refundable situations">
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
            "Chargebacks for legitimately delivered service (see Terms).",
          ]}
        />
      </Clause>
    </LegalPage>
  );
}
