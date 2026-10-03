import type { Metadata } from "next";
import { Callout, Clause, LegalPage, List, Mail, Sub, type KeyPoint } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Terms & conditions — Tiffin Grab",
  description: "The terms that govern ordering from and subscribing to TiffinGrab in Ontario, Canada.",
};

const ALLERGENS = [
  ["Gluten / wheat", "HIGH", "Roti, naan, thepla, flour-based items"],
  ["Dairy", "HIGH", "Curries, rice, paneer, desserts"],
  ["Tree nuts", "HIGH", "Gravies, biryani, sweets"],
  ["Peanuts", "HIGH", "Chutneys, snacks, some curries"],
  ["Sesame / soy / eggs", "MOD", "Various menu items"],
] as const;


const SECTIONS = [
  "Parties & definitions",
  "Eligibility & account",
  "Services",
  "Payment & billing",
  "Subscriptions & changes",
  "Allergens & food safety",
  "Acceptable use",
  "Intellectual property",
  "Limitation of liability",
  "Disputes & governing law",
  "General",
] as const;

const KEY_POINTS: KeyPoint[] = [
  { text: "You must be 18 or older (or have a guardian's consent) and live in an area we deliver to.", section: 2 },
  { text: "Prices are in CAD and plans are paid upfront. A plan renews automatically only if checkout says so.", section: 4 },
  { text: "To pause, tell us at least 24 hours before your next delivery. Unused days may be credited to the end of your plan, not refunded in cash.", section: 5 },
  { text: "Our kitchen handles gluten, dairy, tree nuts, peanuts, sesame, soy, and eggs. Our food is not suitable for severe allergies.", section: 6 },
  { text: "If something goes wrong, our liability is limited to what you paid for that order or period in the last 30 days.", section: 9 },
  { text: "Ontario and Canadian law apply, and disputes go to Ontario courts.", section: 10 },
];

export default function TermsPage() {
  return (
    <LegalPage title="Terms & conditions" intro="The agreement between you and TiffinGrab when you order or subscribe: who can order, how billing and plans work, allergens, and what each side is responsible for." updated="April 6, 2026" current="/terms" sections={SECTIONS} keyPoints={KEY_POINTS}>
      <Callout>
        <strong>Binding agreement.</strong> By using tiffingrab.ca, placing an order, or subscribing, you agree to these
        Terms with TiffinGrab. If you disagree, do not use our services. These Terms are governed by the laws of Ontario
        and Canada.
      </Callout>

      <Clause n={1} title={SECTIONS[0]}>
        <List
          items={[
            <><strong>“TiffinGrab”</strong> means the business operating under that name in Ontario, Canada.</>,
            <><strong>“Customer”, “you”</strong> means anyone who browses, registers, or orders through our website or channels.</>,
            <><strong>“Services”</strong> means meal preparation, packaging, delivery, subscriptions, and related offerings.</>,
            <><strong>“Agreement”</strong> means these Terms together with our Privacy, Refund, and Delivery policies.</>,
          ]}
        />
      </Clause>

      <Clause n={2} title={SECTIONS[1]}>
        <p className="m-0">You must:</p>
        <List
          items={[
            "Be at least 18, or have verifiable guardian consent;",
            "Provide a deliverable address in our service areas;",
            "Provide accurate payment and contact information; and",
            "Not be suspended from our platform for abuse or fraud.",
          ]}
        />
        <p className="m-0">
          We may refuse service or cancel orders where requirements are not met. You are responsible for activity on your
          account. Notify us at <Mail /> of unauthorized use.
        </p>
      </Clause>

      <Clause n={3} title={SECTIONS[2]}>
        <p className="m-0">
          We deliver fresh, home-style meals in select GTA areas. Availability, menus, and service areas may change. We
          may modify or pause services with reasonable notice where feasible.
        </p>
        <Callout>
          <strong>Note:</strong> Review the current weekly menu before ordering. Ingredients and areas may change.
        </Callout>
      </Clause>

      <Clause n={4} title={SECTIONS[3]}>
        <Sub title="4.1 Payment">
          <p className="m-0">Fees are due at purchase unless we agree otherwise in writing.</p>
        </Sub>
        <Sub title="4.2 Currency & pricing">
          <p className="m-0">
            Prices are in <strong>CAD</strong> and include applicable taxes unless stated otherwise. We may change prices
            with reasonable notice; changes do not apply retroactively to active prepaid periods where stated.
          </p>
        </Sub>
        <Sub title="4.3 Subscriptions">
          <p className="m-0">
            Plans are typically billed upfront for the selected duration. <strong>Automatic renewal</strong> applies only
            if clearly disclosed at checkout; otherwise renew manually.
          </p>
        </Sub>
        <Sub title="4.4 Failed payments & chargebacks">
          <p className="m-0">
            We may suspend delivery on failed payment until resolved. Chargebacks for legitimately delivered service breach
            this Agreement and may result in suspension and recovery of costs.
          </p>
        </Sub>
      </Clause>

      <Clause n={5} title={SECTIONS[4]}>
        <p className="m-0">Plans are non-transferable and tied to the registered delivery address unless we approve a change.</p>
        <p className="m-0">
          <strong>Pausing:</strong> request at least <strong>24 hours</strong> before the next delivery via WhatsApp or
          email; unused days may be credited to the end of the period (not cash).
        </p>
        <p className="m-0">
          <strong>Address changes:</strong> require advance notice and serviceability confirmation; out-of-area moves may
          follow the Refund Policy.
        </p>
      </Clause>

      <Clause n={6} title={SECTIONS[5]}>
        <Callout tone="warn">
          <strong>Allergen warning:</strong> Meals are prepared in a <strong>shared kitchen</strong> where gluten, dairy,
          tree nuts, peanuts, sesame, soy, eggs, and other allergens may be present. <strong>Cross-contact is
          possible.</strong> Our food is <strong>not suitable</strong> for severe or life-threatening allergies.
        </Callout>
        <Sub title="6.1 Kitchen presence (summary)">
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-4 font-semibold">Allergen</th>
                  <th className="py-2 pr-4 font-semibold">Presence</th>
                  <th className="py-2 font-semibold">Common sources</th>
                </tr>
              </thead>
              <tbody>
                {ALLERGENS.map(([name, level, sources]) => (
                  <tr key={name} className="border-b last:border-0">
                    <td className="py-2 pr-4">{name}</td>
                    <td className="py-2 pr-4 font-semibold">{level}</td>
                    <td className="text-muted-foreground py-2">{sources}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sub>
        <p className="m-0">
          <strong>Your responsibility:</strong> You assess suitability for your health needs. By ordering you accept
          shared-kitchen risk. We do not guarantee absence of any allergen. Consult a professional if unsure.
        </p>
        <p className="m-0">
          <strong>Liability cap for reactions:</strong> To the maximum extent permitted by law, we are not liable for
          allergic reactions where risks were disclosed as above.
        </p>
      </Clause>

      <Clause n={7} title={SECTIONS[6]}>
        <p className="m-0">
          You will not submit fraudulent claims, harass staff or couriers, abuse chargebacks, break the law, or share
          account access to evade plan rules. Breach may mean immediate termination without refund.
        </p>
      </Clause>

      <Clause n={8} title={SECTIONS[7]}>
        <p className="m-0">
          Site content, branding, menus, and media are owned by TiffinGrab or licensors. No copying or commercial reuse
          without written permission.
        </p>
      </Clause>

      <Clause n={9} title={SECTIONS[8]}>
        <p className="m-0">
          To the fullest extent permitted by law, our aggregate liability for a claim is limited to the{" "}
          <strong>amount you paid for the specific order or subscription period</strong> giving rise to the claim in the
          preceding 30 days (or as law requires). We are not liable for indirect or consequential damages. Service may be
          interrupted; that alone is not a breach.
        </p>
        <p className="m-0">
          <strong>Force majeure:</strong> We are not liable for delays or failures outside reasonable control (weather,
          government action, infrastructure, etc.).
        </p>
      </Clause>

      <Clause n={10} title={SECTIONS[9]}>
        <p className="m-0">
          These Terms are governed by <strong>Ontario and Canadian federal law</strong>. Disputes should first be
          negotiated in good faith. If unresolved, courts in Ontario have exclusive jurisdiction, to the extent permitted.
          You waive class actions where allowable.
        </p>
      </Clause>

      <Clause n={11} title={SECTIONS[10]}>
        <List
          items={[
            <><strong>Entire agreement:</strong> These Terms and the linked policies replace prior oral or inconsistent terms.</>,
            <><strong>Severability, waiver, assignment:</strong> Standard provisions apply as permitted by law.</>,
            <><strong>Changes:</strong> We may update Terms; continued use after the posted effective date means acceptance.</>,
            <><strong>Notices:</strong> <Mail /></>,
          ]}
        />
      </Clause>
    </LegalPage>
  );
}
