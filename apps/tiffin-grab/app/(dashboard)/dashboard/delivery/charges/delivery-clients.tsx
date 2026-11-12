"use client";

import type { ComponentProps, ReactNode } from "react";
import { DeliveryAdminProvider, DeliveryChargesManager, type DeliveryAdminActions } from "@foundry/delivery/ui";
import type { ActionResult } from "@/lib/actions/action-result";
import { unwrapAction } from "@/lib/actions/unwrap";
import {
  connectDeliveryStrategyAction,
  deleteAddressTagAction,
  deleteDeliveryStrategyAction,
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

// The zone/type screens read `res.error` rather than catching, so a refusal stays a value here.
async function soft<T extends Record<string, unknown>>(p: Promise<ActionResult<T>>): Promise<{ error?: string } & Partial<T>> {
  const r = await p;
  if ("error" in r) return { error: String(r.error) } as { error?: string } & Partial<T>;
  const { ok: _ok, message: _message, ...rest } = r;
  return rest as unknown as Partial<T>;
}

const adminActions: DeliveryAdminActions = {
  saveZone: (i) => soft(saveZoneAction(i)),
  retireZone: (id) => soft(retireZoneAction(id)),
  setZoneTypes: (z, t) => soft(setZoneTypesAction(z, t)),
  saveStoreOrigin: (lat, lng) => soft(saveStoreOriginAction(lat, lng)),
  saveStoreOriginFromAddress: (i) => soft(saveStoreOriginFromAddressAction(i)),
  saveType: (i) => soft(saveDeliveryTypeAction(i)),
  retireType: (id) => soft(retireDeliveryTypeAction(id)),
};

export function DeliveryAdminBoundary({ children }: { children: ReactNode }) {
  return <DeliveryAdminProvider actions={adminActions}>{children}</DeliveryAdminProvider>;
}

// The charges screen catches thrown errors, so a refusal is rethrown with its message.
const v = async <T,>(p: Promise<ActionResult<{ value: T }>>) => (await unwrapAction(p)).value;

const chargesActions: ComponentProps<typeof DeliveryChargesManager>["actions"] = {
  updateBaseCharge: (a) => v(updateBaseChargeAction(a)),
  saveDeliveryStrategy: (i) => v(saveDeliveryStrategyAction(i)),
  deleteDeliveryStrategy: (id) => v(deleteDeliveryStrategyAction(id)),
  saveDeliveryStrategyGroup: (i) => v(saveDeliveryStrategyGroupAction(i)),
  deleteDeliveryStrategyGroup: (id) => v(deleteDeliveryStrategyGroupAction(id)),
  connectDeliveryStrategy: (id, c) => v(connectDeliveryStrategyAction(id, c)),
  saveAddressTag: (i) => v(saveAddressTagAction(i)),
  deleteAddressTag: (id) => v(deleteAddressTagAction(id)),
};

export function DeliveryChargesBoundary(props: Omit<ComponentProps<typeof DeliveryChargesManager>, "actions">) {
  return <DeliveryChargesManager {...props} actions={chargesActions} />;
}
