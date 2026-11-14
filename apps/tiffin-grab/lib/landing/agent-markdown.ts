// Markdown for agents: a request for a public page that asks for `Accept: text/markdown` gets a
// markdown answer built from live data (proxy.ts rewrites it to app/agents-md). Browsers never ask
// for markdown, so they keep getting HTML. Pure; the route loads the data. Negotiation: markdown-negotiation.ts.
import type { FaqGroup } from "@/lib/landing/faq-list";
import { deliveryLine } from "@/lib/landing/llms-text";
import { BRAND_NAME, CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/brand";
import type { SiteFacts } from "@/lib/landing/site-facts";

export function faqMd(groups: FaqGroup[], origin: string): string {
  const out = [`# ${BRAND_NAME} FAQ`, "", `Source: ${origin}/faq`, ""];
  for (const g of groups) {
    if (g.heading) out.push(`## ${g.heading}`, "");
    for (const { q, a } of g.items) out.push(`### ${q}`, "", a, "");
  }
  return out.join("\n");
}

export function areasMd(f: SiteFacts, origin: string): string {
  const out = [`# ${BRAND_NAME} delivery areas`, "", `Source: ${origin}/locations`, ""];
  out.push(`We deliver home-style tiffins to ${f.areas.length} areas across the Greater Toronto Area. Your postal code sets your delivery run, and your run sets the window your tiffin arrives in.`, "");
  if (f.runs.length) {
    out.push("## Delivery windows", "", "| Window | Areas |", "| --- | --- |");
    for (const r of f.runs) out.push(`| ${r.label} | ${r.areas.join(", ")} |`);
    out.push("");
  }
  out.push("## Good to know", "");
  out.push("- Standard deliveries run Monday to Friday; Saturday and Sunday tiffins come with the Friday delivery.");
  if (f.cutoff) out.push(`- Change or pause any day by ${f.cutoff} the night before.`);
  out.push(`- ${deliveryLine(f)}`);
  out.push(`- Not on the list? Write to ${CONTACT_EMAIL} or WhatsApp ${CONTACT_PHONE}.`, "");
  return out.join("\n");
}

/** Rough token count (about four characters a token), for the x-markdown-tokens header. */
export const tokenEstimate = (md: string) => Math.ceil(md.length / 4);
