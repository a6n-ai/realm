import type { DeliveryAdminActions, DeliveryChargesActions } from "@foundry/delivery/ui";
import {
  deleteAddressTagAction,
  deleteDeliveryStrategyAction,
  deleteDeliveryStrategyConnectionAction,
  deleteDeliveryStrategyGroupAction,
  retireDeliveryTypeAction,
  retireZoneAction,
  saveAddressTagAction,
  saveDeliveryStrategyAction,
  saveDeliveryStrategyConnectionAction,
  saveDeliveryStrategyGroupAction,
  saveDeliveryTypeAction,
  saveStoreOriginAction,
  saveStoreOriginFromAddressAction,
  saveZoneAction,
  setZoneTypesAction,
  updateBaseChargeAction,
} from "./actions";

/** Server-action references handed to the @foundry/delivery admin screens. */
export const deliveryAdminActions: DeliveryAdminActions = {
  saveZone: saveZoneAction,
  retireZone: retireZoneAction,
  setZoneTypes: setZoneTypesAction,
  saveStoreOrigin: saveStoreOriginAction,
  saveStoreOriginFromAddress: saveStoreOriginFromAddressAction,
  saveType: saveDeliveryTypeAction,
  retireType: retireDeliveryTypeAction,
};

export const deliveryChargesActions: DeliveryChargesActions = {
  updateBaseCharge: updateBaseChargeAction,
  saveDeliveryStrategy: saveDeliveryStrategyAction,
  deleteDeliveryStrategy: deleteDeliveryStrategyAction,
  saveDeliveryStrategyGroup: saveDeliveryStrategyGroupAction,
  deleteDeliveryStrategyGroup: deleteDeliveryStrategyGroupAction,
  saveDeliveryStrategyConnection: saveDeliveryStrategyConnectionAction,
  deleteDeliveryStrategyConnection: deleteDeliveryStrategyConnectionAction,
  saveAddressTag: saveAddressTagAction,
  deleteAddressTag: deleteAddressTagAction,
};
