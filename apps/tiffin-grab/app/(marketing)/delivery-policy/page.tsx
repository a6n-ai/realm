import type { Metadata } from "next";
import { Callout, Clause, LegalPage, List, Mail, Sub } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Delivery policy — Tiffin Grab",
  description: "TiffinGrab's service areas, delivery schedule and windows, failed deliveries, packaging, and food handling.",
};

export default function DeliveryPolicyPage() {
  return (
    <LegalPage title="Delivery policy" meta="Effective: April 6, 2026 · Last updated: April 6, 2026" current="/delivery-policy">
      <Callout>
        <strong>Please note:</strong> TiffinGrab delivers freshly prepared meals. Delivery windows are estimated, not
        guaranteed fixed times. Customer cooperation on access and availability helps us complete deliveries successfully.
      </Callout>

      <Clause n={1} title="Service areas">
        <p className="m-0">TiffinGrab currently delivers within the following Greater Toronto Area locations:</p>
        <List items={["Scarborough", "Downtown Toronto", "North York", "Brampton", "Mississauga", "Markham", "Etobicoke"]} />
        <p className="m-0">
          Serviceability for specific addresses is confirmed at checkout. We may add or remove service areas. If your area
          is removed after purchase, see the Refund Policy for the applicable remedy.
        </p>
      </Clause>

      <Clause n={2} title="Delivery fees">
        <p className="m-0">
          <strong>Delivery is included</strong> in the price of subscription plans unless otherwise stated at checkout. We do
          not add separate delivery, fuel, or hidden fees except for clearly disclosed custom or out-of-area arrangements.
        </p>
      </Clause>

      <Clause n={3} title="Delivery schedule">
        <p className="m-0">
          Standard deliveries are made <strong>Monday through Saturday</strong>. Sunday and public-holiday availability will
          be communicated to active subscribers at least 48 hours in advance. We will notify you of scheduled off-days or
          holiday closures by email or WhatsApp.
        </p>
      </Clause>

      <Clause n={4} title="Delivery windows & timing">
        <p className="m-0">
          Because routes are optimized daily, we provide <strong>estimated delivery windows</strong>, not exact times.
          Windows are typically communicated the evening before or the morning of delivery. Actual time within the window
          may vary with traffic, weather, and volume.
        </p>
        <Callout tone="warn">
          <strong>No fixed-time delivery is guaranteed.</strong> If your building requires buzzer codes, lobby security, or
          gated access, tell us at least 24 hours in advance. Failure to do so may result in a failed delivery with no refund.
        </Callout>
      </Clause>

      <Clause n={5} title="Failed & missed deliveries">
        <Sub title="5.1 Single delivery attempt">
          <p className="m-0">
            Our team makes <strong>one delivery attempt</strong> during your assigned window. If you are unavailable and no
            safe drop-off instructions were provided, the delivery may be recorded as failed.
          </p>
        </Sub>
        <Sub title="5.2 Customer-caused failures">
          <p className="m-0">
            We do not issue refunds, credits, or replacements when failure is due to customer unavailability, an incorrect
            address, locked access without prior instructions, or refusal to accept delivery.
          </p>
        </Sub>
        <Sub title="5.3 Pre-arranged drop-off">
          <p className="m-0">
            You may authorize a safe drop-off (e.g. doorstep, concierge, neighbour) by notifying us at least{" "}
            <strong>12 hours before</strong> your window. Once food is left at the agreed location, our delivery obligation
            ends. We are not responsible for tampering, theft, or spoilage after drop-off.
          </p>
        </Sub>
        <Sub title="5.4 TiffinGrab-caused failures">
          <p className="m-0">
            If we fail due to our error (e.g. wrong address despite correct information from you, or breakdown with no
            re-route), the affected day will be <strong>credited</strong> to your subscription within 24 hours of confirmed
            failure.
          </p>
        </Sub>
      </Clause>

      <Clause n={6} title="Damaged or compromised packaging">
        <p className="m-0">
          Report damaged packaging within <strong>two hours of delivery</strong> via WhatsApp{" "}
          <a href="https://wa.me/16472449813" className="underline underline-offset-4">+1 (647) 244-9813</a> or <Mail /> with a
          photo. Verified cases receive a <strong>one-day service credit</strong>. Same-day re-delivery depends on route
          capacity and is not guaranteed.
        </p>
      </Clause>

      <Clause n={7} title="Food handling after delivery">
        <p className="m-0">Meals are prepared fresh and packed in food-safe materials. After delivery:</p>
        <List
          items={[
            <>Refrigerate within <strong>two hours</strong> if not eating immediately;</>,
            <>Consume refrigerated meals within <strong>24 hours</strong> for best quality and safety;</>,
            "Reheat thoroughly; and",
            "Do not refreeze meals that have been refrigerated.",
          ]}
        />
        <p className="m-0">We are not liable for health issues arising from improper handling after delivery.</p>
      </Clause>

      <Clause n={8} title="Weather & force majeure">
        <p className="m-0">
          Severe weather (Environment Canada warnings), road closures, emergencies, or other force majeure events may delay,
          reschedule, or cancel deliveries. Affected service days are <strong>credited</strong> to your subscription. We
          will communicate disruptions by email or WhatsApp as promptly as we can.
        </p>
      </Clause>
    </LegalPage>
  );
}
