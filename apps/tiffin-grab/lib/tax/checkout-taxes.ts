import type { TaxLine } from "@foundry/payments";
import { getProvinceTaxes } from "@/lib/services/app-settings.service";
import { calculateTax, type TaxAddress, type TaxQuote } from "@foundry/payments/stripe";
import { createLogger } from "@foundry/commons/logger";
import { sharedCache } from "@/lib/cache";
import { priceSubscription } from "@/lib/pricing/engine";
import type { PricingCatalog, PricingLine, PricingResult, PricingSelections } from "@/lib/pricing/types";
import { stripeRuntime, toCents } from "@/lib/payments/stripe";
import { resolveProvince, resolveTaxLines, type Province } from "./canada";

const log = createLogger("checkout-taxes");

/**
 * The single answer to "which tax lines apply to this checkout", used by the
 * checkout preview (reprice), createOrder, and the renewal requote. Having one
 * function is the point: when the preview and the order resolved tax in two
 * places, the customer could be shown a total that differed from the one charged.
 *
 * When the delivery address resolves to a province, that province's lines (with
 * admin overrides) are used — even if an admin has zeroed them all, e.g. because
 * the food is exempt; falling back to the method's taxes then would quietly
 * re-tax an order the admin decided should carry none. The payment method's own
 * taxes apply only when no province can be resolved, so an install configured
 * before province tax keeps billing as before. Never both — that would double-tax.
 */
export async function resolveCheckoutTaxes(args: {
  postalCode?: string | null;
  province?: string | null;
  methodTaxes: TaxLine[];
}): Promise<{ taxes: TaxLine[]; province: Province | null }> {
  const province = resolveProvince(args);
  if (!province) return { taxes: args.methodTaxes, province: null };
  const overrides = await getProvinceTaxes();
  return { taxes: resolveTaxLines(args, overrides as Partial<Record<Province, TaxLine[]>>), province };
}

export type TaxMeta = { source: "stripe" | "fallback"; calculationId: string | null; expiresAt: number | null };

// Preview reprices on every wizard change; cache identical (base, address) quotes briefly
// so typing doesn't fire a Stripe call per keystroke. createOrder bypasses it (fresh calc).
let quoteCache: ReturnType<typeof sharedCache> | undefined;
const quotes = () => (quoteCache ??= sharedCache("stripe-tax-quotes", 10 * 60_000));

/** Stripe Tax quote, or null when Stripe Tax is off/unavailable/failing (caller falls back). */
export async function stripeTaxFor(
  i: { taxableCents: number; reference: string; address: TaxAddress },
  opts: { cache?: boolean } = {},
): Promise<TaxQuote | null> {
  if (i.taxableCents <= 0 || !i.address.postalCode || !i.address.line1) return null;
  const rt = await stripeRuntime();
  if (!rt || !rt.cfg.tax.enabled || !rt.cfg.tax.taxCode) return null;
  const key = `${rt.cfg.tax.taxCode}|${i.taxableCents}|${i.address.postalCode}|${i.address.province ?? ""}|${i.address.line1}`;
  if (opts.cache) {
    const hit = (await quotes().get<TaxQuote>(key))?.value;
    if (hit && (hit.expiresAt ?? Infinity) > Date.now() + 5 * 60_000) return hit;
  }
  try {
    const q = await calculateTax(rt.stripe, { amountCents: i.taxableCents, taxCode: rt.cfg.tax.taxCode, reference: i.reference, address: i.address });
    if (opts.cache) await quotes().set(key, q);
    return q;
  } catch (e) {
    log.warn({ code: (e as { code?: string }).code, message: (e as Error).message }, "stripe tax failed; using fallback rates");
    return null;
  }
}

/**
 * The one pricing+tax entry point for preview, createOrder, renewal requote and
 * admin inquiry orders. Stripe Tax when enabled; otherwise (or on any failure)
 * the existing province/method lines via resolveCheckoutTaxes, so checkout is never blocked.
 */
export async function priceWithTax(args: {
  selections: PricingSelections;
  catalog: PricingCatalog;
  adjustments?: PricingLine[];
  address: { line1?: string | null; city?: string | null; postalCode?: string | null; province?: string | null };
  methodTaxes: TaxLine[];
  reference: string;
  cache?: boolean;
}): Promise<{ pricing: PricingResult; taxProvince: Province | null; tax: TaxMeta }> {
  const adjustments = args.adjustments ?? [];
  const { taxes: fallbackTaxes, province } = await resolveCheckoutTaxes({ postalCode: args.address.postalCode, province: args.address.province, methodTaxes: args.methodTaxes });

  // ponytail: tax waivers are ignored on the Stripe Tax path; wire them into the taxable base if one is ever configured.
  const preTax = priceSubscription(args.selections, args.catalog, adjustments, []);
  const quote = await stripeTaxFor({
    taxableCents: toCents(preTax.total),
    reference: args.reference,
    address: { line1: args.address.line1 ?? "", city: args.address.city, postalCode: args.address.postalCode ?? "", province: args.address.province ?? province },
  }, { cache: args.cache });

  if (quote) {
    const taxLines = quote.lines.map((l) => ({ name: l.label, ratePct: l.ratePct, amount: l.amountCents / 100 }));
    return {
      pricing: { ...preTax, taxLines, taxTotal: quote.taxCents / 100, total: quote.totalCents / 100 },
      taxProvince: province,
      tax: { source: "stripe", calculationId: quote.calculationId, expiresAt: quote.expiresAt },
    };
  }
  return {
    pricing: priceSubscription(args.selections, args.catalog, adjustments, fallbackTaxes),
    taxProvince: province,
    tax: { source: "fallback", calculationId: null, expiresAt: null },
  };
}
