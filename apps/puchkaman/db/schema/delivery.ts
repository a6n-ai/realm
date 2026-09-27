import { makeDeliveryTables } from "@foundry/delivery/schema";
import { organization } from "./organizations";

export const {
  deliveryZones,
  deliveryTypes,
  deliveryZoneTypes,
  deliveryChargeType,
  deliveryChargeConfigs,
  deliveryStrategyGroups,
  deliveryStrategyConnections,
  deliveryStrategies,
  addressTags,
} = makeDeliveryTables({ organization });
