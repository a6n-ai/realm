import { BRAND_NAME, CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/brand";
import type { SiteFacts } from "@/lib/landing/site-facts";
import { formatMoney } from "@foundry/commons";
import { pageOf } from "@/lib/routing/public-pages";

const and = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function deliveryLine(f: SiteFacts) {
  if (!f.free) return "Delivery has a charge, shown at checkout before you pay.";
  return `Delivery is free.${dropOffNote(f)}`;
}

/** " An upstairs drop-off is optional, at $1.50 a delivery." or "": the one paid extra, said next to "free". */
export function dropOffNote(f: SiteFacts) {
  if (!f.dropOff) return "";
  const name = f.dropOff.name.toLowerCase();
  return ` ${/^[aeiou]/.test(name) ? "An" : "A"} ${name} drop-off is optional, at ${formatMoney(f.dropOff.charge, f.currency)} a delivery.`;
}

/** /llms.txt: what an AI assistant needs to answer "what is Tiffin Grab, what does it cost, do you deliver to me". */
export function llmsTxt(f: SiteFacts, origin: string, opts: { reviews: boolean }): string {
  const m = (n: number) => formatMoney(n, f.currency);
  const u = (p: string) => `${origin}${p}`;
  const pageLine = (path: string) => {
    const { label, llms } = pageOf(path);
    return `- [${llms?.title ?? label}](${u(path)})${llms?.desc ? `: ${llms.desc}` : ""}`;
  };
  const range = f.plans.flatMap((p) => p.sizes.filter((s) => !s.trial).map((s) => s.rate));
  const lines = [
    `# ${BRAND_NAME}`,
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
    pageLine("/pricing"),
    `- [Pricing as Markdown](${u("/pricing.md")}): the same price list as plain text`,
    ...["/menu", "/locations", "/faq", "/about"].map(pageLine),
  );
  if (opts.reviews) lines.push(pageLine("/reviews"));
  lines.push(
    ...["/refer", "/contact"].map(pageLine),
    "",
    "## Policies",
    "",
    ...["/terms", "/privacy", "/refund-policy", "/delivery-policy"].map(pageLine),
    "",
    "Ordering, account and checkout pages need sign-in and are not meant for crawling.",
    "",
  );
  return lines.join("\n");
}

/** /pricing.md: the price list as markdown, one table per diet. */
export function pricingMd(f: SiteFacts, origin: string): string {
  const m = (n: number) => formatMoney(n, f.currency);
  const cell = (s: string) => s.replace(/\|/g, "/");
  const lines = [`# ${BRAND_NAME} pricing`, "", `Prices are per tiffin, in ${f.currency}. A plan costs the per-tiffin rate times the number of tiffins in it. Live prices: ${origin}/pricing`, ""];
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
