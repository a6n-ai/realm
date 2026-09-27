import { makeDeliveryTables } from "@foundry/delivery/schema";
import { organization } from "./organizations";

export const {
  deliveryZones,
  deliveryTypes,
  deliveryZoneTypes,
  deliveryChargeType,
  deliveryChargeConfigs,
  deliveryStrategyGroups,
  deliveryStrategies,
  addressTags,
} = makeDeliveryTables({ organization });
