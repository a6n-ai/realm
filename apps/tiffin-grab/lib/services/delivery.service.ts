import { eq } from "drizzle-orm";
import { createDeliveryService } from "@foundry/delivery/service";
import { db } from "@/db/client";
import {
  addressTags,
  deliveryChargeConfigs,
  deliveryChargeType,
  deliveryStrategies,
  deliveryTypes,
  deliveryZoneTypes,
  deliveryZones,
  orders,
  users,
} from "@/db/schema";
import { currentUserId, recordAudit } from "@/lib/services/session-service";

export type { DeliveryChargeRuleDto, DeliveryChargeRuleInput } from "@foundry/delivery";

const referenced = async (checks: Promise<unknown[]>[]) => (await Promise.all(checks)).some((rows) => rows.length > 0);

/** The shared @foundry/delivery service: zones, types, charges and store origin, org-scoped per call. */
export const deliveryService = createDeliveryService({
  db,
  tables: {
    deliveryZones,
    deliveryTypes,
    deliveryZoneTypes,
    deliveryChargeType,
    deliveryChargeConfigs,
    deliveryStrategies,
    addressTags,
  },
  isStrategyInUse: (id) =>
    referenced([
      db.select({ id: orders.id }).from(orders).where(eq(orders.deliveryStrategyId, id)).limit(1),
      db.select({ id: users.id }).from(users).where(eq(users.deliveryStrategyId, id)).limit(1),
    ]),
  isAddressTagInUse: (id) =>
    referenced([
      db.select({ id: orders.id }).from(orders).where(eq(orders.addressTagId, id)).limit(1),
      db.select({ id: users.id }).from(users).where(eq(users.addressTagId, id)).limit(1),
    ]),
  currentUserId,
  audit: async (e) => recordAudit({ ...e, createdBy: await currentUserId() }),
});
