import { makeAddressTables } from "@foundry/address/schema";
import { sql } from "drizzle-orm";
import { bigint } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { addressTags, deliveryStrategies, deliveryStrategyGroups } from "./delivery";
import { organization } from "./organizations";

export const { customerAddresses } = makeAddressTables({
  users,
  organization,
  extraColumns: () => ({
    addressTagId: bigint("address_tag_id", { mode: "bigint" }).references(() => addressTags.id),
    deliveryStrategyId: bigint("delivery_strategy_id", { mode: "bigint" }).references(() => deliveryStrategies.id),
    // Picked strategy options, at most one per strategy group. No FK on arrays; options are
    // soft-deleted, so ids stay resolvable. Supersedes delivery_strategy_id.
    deliveryStrategyIds: bigint("delivery_strategy_ids", { mode: "bigint" }).array().notNull().default(sql`'{}'::bigint[]`),
    // The address's tag (Home, Apartment…), optional; its strategies are in delivery_strategy_ids.
    deliveryTagId: bigint("delivery_tag_id", { mode: "bigint" }).references(() => deliveryStrategyGroups.id),
  }),
});
