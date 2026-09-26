import { makeDeliveryTables } from "@foundry/delivery/schema";
import { organization } from "./organizations";

export const {
  deliveryZones,
  deliveryTypes,
  deliveryZoneTypes,
  deliveryChargeType,
  deliveryChargeConfigs,
  deliveryStrategies,
  addressTags,
} = makeDeliveryTables({ organization });
