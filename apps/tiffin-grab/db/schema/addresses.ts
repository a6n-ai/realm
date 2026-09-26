import { makeAddressTables } from "@foundry/address/schema";
import { bigint } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { addressTags, deliveryStrategies } from "./delivery";
import { organization } from "./organizations";

export const { customerAddresses } = makeAddressTables({
  users,
  organization,
  extraColumns: () => ({
    addressTagId: bigint("address_tag_id", { mode: "bigint" }).references(() => addressTags.id),
    deliveryStrategyId: bigint("delivery_strategy_id", { mode: "bigint" }).references(() => deliveryStrategies.id),
  }),
});
