import { makeDiscountTables } from "@foundry/discounts/schema";
import { organization } from "./organizations";

export const { discountKind, discounts } = makeDiscountTables({ organization });
