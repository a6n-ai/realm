import { makeDiscountTables } from "@foundry/discounts/schema";
import { organization } from "./organizations";

export const { discountKind, discounts } = makeDiscountTables<["delivery", "duration", "meal_size", "waiver_delivery", "waiver_base", "waiver_strategy", "waiver_tax"]>({
  organization,
  // meal_size rows set a meal size's list price (percent or flat `amount`); they are not additive order lines.
  // waiver_* rows waive a percent of a fee (target_id = strategy for waiver_strategy) or cover the tax.
  kinds: ["delivery", "duration", "meal_size", "waiver_delivery", "waiver_base", "waiver_strategy", "waiver_tax"],
});
