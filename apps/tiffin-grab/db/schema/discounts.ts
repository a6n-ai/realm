import { makeDiscountTables } from "@foundry/discounts/schema";
import { organization } from "./organizations";

export const { discountKind, discounts } = makeDiscountTables<["delivery", "duration", "meal_size"]>({
  organization,
  // meal_size rows set a meal size's list price (percent or flat `amount`); they are not additive order lines.
  kinds: ["delivery", "duration", "meal_size"],
});
