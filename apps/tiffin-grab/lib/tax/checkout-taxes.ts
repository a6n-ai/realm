import type { TaxLine } from "@foundry/payments";
import { getProvinceTaxes } from "@/lib/services/app-settings.service";
import { resolveProvince, resolveTaxLines, type Province } from "./canada";

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
