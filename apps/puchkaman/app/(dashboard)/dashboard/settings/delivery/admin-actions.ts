import type { DeliveryAdminActions, DeliveryChargesActions } from "@foundry/delivery/ui";
import {
  deleteAddressTagAction,
  deleteDeliveryStrategyAction,
  connectDeliveryStrategyAction,
  deleteDeliveryStrategyGroupAction,
  retireDeliveryTypeAction,
  retireZoneAction,
  saveAddressTagAction,
  saveDeliveryStrategyAction,
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
  connectDeliveryStrategy: connectDeliveryStrategyAction,
  saveAddressTag: saveAddressTagAction,
  deleteAddressTag: deleteAddressTagAction,
};
