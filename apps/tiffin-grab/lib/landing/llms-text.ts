import { CONTACT_EMAIL, CONTACT_PHONE, type SiteFacts } from "@/lib/landing/site-facts";

const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const money = (n: number, currency: string) => new Intl.NumberFormat("en-CA", { style: "currency", currency, minimumFractionDigits: 2 }).format(n);

export function deliveryLine(f: SiteFacts) {
  return f.free ? "Delivery is free." : "Delivery has a charge, shown at checkout before you pay.";
}

/** /llms.txt: what an AI assistant needs to answer "what is Tiffin Grab, what does it cost, do you deliver to me". */
export function llmsTxt(f: SiteFacts, origin: string, opts: { reviews: boolean }): string {
  const m = (n: number) => money(n, f.currency);
  const u = (p: string) => `${origin}${p}`;
  const range = f.plans.flatMap((p) => p.sizes.filter((s) => !s.trial).map((s) => s.rate));
  const lines = [
    "# Tiffin Grab",
    "",
    `> Home-style Indian tiffin meals delivered across the Greater Toronto Area, Ontario, Canada. Choose a diet (${and(f.plans.map((p) => p.name)) || "veg or non-veg"}), a meal size, the delivery days and how many weeks, then order online.`,
    "",
    "## Key facts",
    "",
  ];
  if (f.from != null) lines.push(`- Price: from ${m(f.from)} a tiffin${range.length ? `, up to ${m(Math.max(...range))}` : ""} (${f.currency}), depending on diet and meal size.`);
  if (f.weeksOff.length) lines.push(`- Longer plans: ${and(f.weeksOff.map((d) => `${d.percent}% off every tiffin for ${d.label}`))}.`);
  if (f.trial) lines.push(`- Trial: try ${f.trial.length} first at ${m(f.trial.rate)} a tiffin.`);
  lines.push(`- ${deliveryLine(f)} Standard deliveries run Monday to Friday; Saturday and Sunday tiffins come with the Friday delivery.`);
  if (f.cutoff) lines.push(`- Cutoff: change or pause any day by ${f.cutoff} the night before.`);
  lines.push("- Payment: card (Stripe) or Interac e-Transfer; plans are paid upfront.", `- Contact: ${CONTACT_EMAIL}, WhatsApp ${CONTACT_PHONE}.`, "");
  if (f.runs.length) {
    lines.push("## Delivery areas and windows", "", "Your postal code sets your window. Windows are estimates, shared the evening before or the morning of delivery.", "");
    for (const r of f.runs) lines.push(`- ${r.label}: ${and(r.areas)}`);
    lines.push("");
  }
  lines.push(
    "## Pages",
    "",
    `- [Pricing](${u("/pricing")}): plans, every meal size, what is in it and the rate per tiffin`,
    `- [Pricing as Markdown](${u("/pricing.md")}): the same price list as plain text`,
    `- [Menu](${u("/menu")}): this week's dishes day by day and every meal size`,
    `- [Delivery areas](${u("/locations")}): areas served, delivery windows and a postal code check`,
    `- [FAQ](${u("/faq")}): delivery, pausing, plans, food, payments and refunds`,
  );
  if (opts.reviews) lines.push(`- [Reviews](${u("/reviews")}): Google reviews from customers`);
  lines.push(
    `- [Refer a friend](${u("/refer")}): the referral offer`,
    `- [Contact](${u("/contact")}): ask about a plan, an area or an order`,
    "",
    "## Policies",
    "",
    `- [Terms](${u("/terms")})`,
    `- [Privacy policy](${u("/privacy")})`,
    `- [Refund policy](${u("/refund-policy")})`,
    `- [Delivery policy](${u("/delivery-policy")})`,
    "",
    "Ordering, account and checkout pages need sign-in and are not meant for crawling.",
    "",
  );
  return lines.join("\n");
}

/** /pricing.md: the price list as markdown, one table per diet. */
export function pricingMd(f: SiteFacts, origin: string): string {
  const m = (n: number) => money(n, f.currency);
  const cell = (s: string) => s.replace(/\|/g, "/");
  const lines = ["# Tiffin Grab pricing", "", `Prices are per tiffin, in ${f.currency}. A plan costs the per-tiffin rate times the number of tiffins in it. Live prices: ${origin}/pricing`, ""];
  for (const p of f.plans) {
    lines.push(`## ${p.name}`, "");
    if (p.description) lines.push(p.description, "");
    lines.push("| Size | What is in it | Calories | Protein | Price per tiffin |", "| --- | --- | --- | --- | --- |");
    for (const s of p.sizes) lines.push(`| ${cell(s.name)}${s.trial ? " (trial)" : ""} | ${cell(s.parts.join(", "))} | ${s.kcalMin} to ${s.kcalMax} kcal | ${s.proteinG != null ? `${s.proteinG} g` : ""} | ${m(s.rate)} |`);
    lines.push("");
  }
  if (f.weeksOff.length) lines.push("## Longer plans", "", ...f.weeksOff.map((d) => `- ${d.label}: ${d.percent}% off every tiffin`), "");
  if (f.trial) lines.push("## Trial", "", `Try ${f.trial.length} first at ${m(f.trial.rate)} a tiffin. Trials are not refundable.`, "");
  lines.push("## Delivery", "", `${deliveryLine(f)} Standard deliveries run Monday to Friday across the Greater Toronto Area; Saturday and Sunday tiffins come with the Friday delivery.${f.cutoff ? ` Change or pause any day by ${f.cutoff} the night before.` : ""}`, "");
  return lines.join("\n");
}
